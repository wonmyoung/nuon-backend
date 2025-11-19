const express = require("express");
const router = express.Router();
const UsersModel = require("../models/UsersModel");
const adminRequired = require("../libs/adminRequired");
const verifyToken = require("../libs/verifyToken");
const jwt = require("jsonwebtoken");
const { JWT_SecretKey } = require("../config/env");
const sha256 = require("js-sha256");
const moment = require("moment");
const awsconfig = require("../config/awsconfig");
const AWS = require("aws-sdk");
const multer = require("multer");
const multerS3 = require("multer-s3");

AWS.config.update({
  region: awsconfig.region,
  credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: awsconfig.IdentityPoolId,
  }),
});

const s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  params: {
    Bucket: awsconfig.Bucket,
  },
});

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: awsconfig.Bucket,
    key: function (req, file, callback) {
      console.log(file);
      if (file.fieldname === "file") {
        callback(null, "mmt-" + Date.now() + "." + file.mimetype.split("/")[1]);
      } else {
        callback(null, Date.now() + "." + file.mimetype.split("/")[1]);
      }
    },
    acl: "public-read-write",
    sslEnabled: true,
    limits: { fileSize: 1024 * 1024 * 500 }, //업로드 용량 제한 500MB
  }),
});

/*
 * 회원 리스트
 */
router.get("/user/list", verifyToken, adminRequired, async (req, res) => {
  const {
    page = 1,
    limit = 10,
    searchWord,
    inputMode,
    isAdmin,
    startDate,
    endDate,
    userSurveyStatus,
  } = req.query;

  let query = {};
  query.isAdmin = isAdmin;

  if (searchWord !== undefined && searchWord !== "") {
    if (inputMode == "companyName") {
      query.companyName = { $regex: `.*${searchWord}.*` };
    } else if (inputMode == "email") {
      query.email = { $regex: `.*${searchWord}.*` };
    } else if (inputMode == "username") {
      query.username = { $regex: `.*${searchWord}.*` };
    } else if (inputMode == "project") {
      query.project = { $regex: `.*${searchWord}.*` };
    }
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate + "T00:00:00");
    if (endDate) query.createdAt.$lte = new Date(endDate + "T23:59:59");
  }

  if (userSurveyStatus && userSurveyStatus !== "") {
    query.userSurveyStatus = userSurveyStatus;
  }

  try {
    const count = await UsersModel.countDocuments(query);

    const users = await UsersModel.find(query, { password: 0 })
      .populate("surveyId", "_id companyName status") // 필요한 필드만
      .limit(parseInt(limit))
      .skip((page - 1) * parseInt(limit))
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      status: 200,
      users,
      total: count,
      page: parseInt(page),
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: true, message: err.message });
  }
});

/**
 * 관리자 페이지 로그인
 * JWT 인증
 * request parameter : email, password
 * response : accesstoken
 */
router.post("/login", async (req, res) => {
  let jsonWebToken;
  const { password, email, autoLogin = false } = req.body;

  UsersModel.findOne({ email: email }, (err, user) => {
    if (!user) {
      res.json({
        status: 407,
        success: true,
        message: "등록되어 있지 않은 아이디 입니다.",
      });
    } else if (user) {
      if (user.isAdmin == false) {
        return res.json({
          status: 401,
          success: true,
          message: "접근 권한이 없는 사용자 입니다.",
        });
      }
      UsersModel.findOne(
        { email: email, password: sha256(password) },
        (err, user) => {
          if (err) {
            console.log(err.message);
          }
          if (!user) {
            return res.json({
              status: 409,
              success: true,
              message: "아이디와 비밀번호를 다시 확인해 주세요.",
            });
          } else if (user) {
            let userInfo = {
              _id: user._id,
              email: user.email,
              username: user.username,
            };
            // "autoLogin", autoLogin;
            if (autoLogin) {
              jsonWebToken = jwt.sign(userInfo, JWT_SecretKey, {});
            } else {
              jsonWebToken = jwt.sign(userInfo, JWT_SecretKey, {
                expiresIn: "1d",
              });
            }

            res
              .status(200)
              .json({ status: 200, success: true, accesstoken: jsonWebToken });
          }
        }
      );
    }
  });
});

/*
 * 회원가입
 * 법률정보 동의, 회원정보, 인증파일 입력
 */
router.post("/join", async (req, res) => {
  const { password, email, userType, username, department, phone } = req.body;
  let user = await UsersModel.findOne({ email: email }).exec();
  if (user) {
    return res.json({
      status: 407,
      message: "이미 사용 중인 이메일입니다. 다른 이메일을 입력해 주세요",
    });
  }
  UsersModel.findOne({ email: email }, async (err, user) => {
    if (err) {
      console.log("err", err);
      return res.status(200).json({ status: 500, message: "Server error" });
    } else if (user)
      return res.status(200).json({
        status: 409,
        message: "You have already registered.",
      });

    let model = new UsersModel({
      password: sha256(password),
      email,
      department,
      username,
      phone,
      isAdmin: true,
      userType,
    });

    await model.save();
    res.status(200).json({
      status: 200,
      message: "관리자 등록이 완료 되었습니다.",
    });
  });
});

/**
 * 회원 상세 정보
 */

router.get("/user/:id", verifyToken, async (req, res) => {
  try {
    let data = await UsersModel.findOne(
      { _id: req.params.id },
      { password: 0 }
    ).exec();

    res.status(200).json({ status: 200, data });
  } catch (err) {
    console.log("err", err);
    res.json({ status: 500, err });
  }
});

/**
 * 회원 정보 수정
 */
router.put("/user", verifyToken, adminRequired, (req, res) => {
  let {
    isAdmin,
    userId,
    username,
    userType,
    project,
    manager,
    department,
    phone,
    memo,
    email,
  } = req.body;
  UsersModel.updateOne(
    { _id: userId },
    {
      isAdmin,
      username,
      userType,
      project,
      manager,
      department,
      phone,
      memo,
      email,
      updatedAt: new Date(),
    },
    (err) => {
      if (err)
        return res.status(500).json({ error: true, message: err.message });
      res.status(200).json({ status: 200, success: true });
    }
  );
});

/**
 * 회원 정보 삭제
 */
router.delete("/user/:id", verifyToken, adminRequired, (req, res) => {
  UsersModel.deleteOne({ _id: req.params.id }, (err) => {
    if (err)
      return res
        .status(200)
        .json({ status: 500, error: true, message: err.message });
    res.status(200).json({ status: 200, success: true });
  });
});

/*
 * 회원탈퇴
 * 회원이 작성한 모든 게시물 삭제 및 외원 정보 삭제
 */
router.post("/withdraw", verifyToken, async (req, res) => {
  const userId = req.body.userId;

  try {
    await UsersModel.updateOne(
      { _id: userId },
      { $set: { password: "", dropedAt: new Date() } }
    ).exec();
    res.status(200).json({
      status: 200,
      success: true,
    });
  } catch (err) {
    console.log(err);
    res.status(200).json({
      status: 500,
      success: false,
      err: err,
    });
  }
});

/*
 * 대쉬보드
 */
router.get("/dashboard", async (req, res) => {
  let year = new Date().getFullYear();
  let month = new Date().getMonth();
  let day = new Date().getDate();
  let today = moment(new Date(year, month, day)).format();
  let thisMonth = moment(new Date(year, month));

  try {
    let data = await Promise.all([
      UsersModel.countDocuments({ isAdmin: false }),
      UsersModel.countDocuments({ isAdmin: false, createdAt: { $gte: year } }), //이번년도 가입 기업수
      UsersModel.countDocuments({
        isAdmin: false,
        createdAt: { $gte: thisMonth },
      }), //이번달 가입 기업수
    ]);

    const totalUser = data[0];
    const yearJoinUser = data[1];
    const monthJoinUser = data[2];

    res.json({
      status: 200,
      totalUser,
      yearJoinUser,
      monthJoinUser,
    });
  } catch (err) {
    console.log(err);
    res.json({ status: 500, error: true, message: err });
  }
});

module.exports = router;
