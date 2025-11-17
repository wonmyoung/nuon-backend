const express = require("express");
const router = express.Router();
const UsersModel = require("../models/UsersModel");
const BasicSurveyResponseModel = require("../models/BasicSurveyResponseModel");
const AdvancedSurveyResponseModel = require("../models/AdvancedSurveyResponseModel");
const jwt = require("jsonwebtoken");
const { JWT_SecretKey } = require("../config/env");
const verifyToken = require("../libs/verifyToken");
const sha256 = require("js-sha256");
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
        callback(
          null,
          "image-" + Date.now() + "." + file.mimetype.split("/")[1]
        );
      } else {
        callback(null, Date.now() + "." + file.mimetype.split("/")[1]);
      }
    },
    acl: "public-read-write",
    sslEnabled: true,
    limits: { fileSize: 1024 * 1024 * 301 }, //업로드 용량 제한 5MB
  }),
});

/**
 * 로그인
 * JWT 인증
 * request parameter : email, password
 * response : accesstoken
 */
router.post("/login", async (req, res) => {
  let jsonWebToken;
  const { password, email, uuid, autoLogin } = req.body;

  UsersModel.findOne({ email: email }, (err, user) => {
    if (!user) {
      res.status(200).json({
        status: 407,
        message: "등록되지 않은 이메일입니다.",
        // message: "The email is not registered.",
      });
    } else if (user) {
      UsersModel.findOne(
        { email: email, password: sha256(password) },
        async (err, user) => {
          if (err) {
            console.log(err);
          }
          if (!user) {
            return res.status(200).json({
              status: 409,
              message: "이메일과 비밀번호를 확인 해주세요.",
            });
          }
          let userInfo = {
            uuid: user.uuid,
            _id: user._id,
            companyId: user._id,
            email: user.email,
            userType: user.userType,
            isAdmin: user.isAdmin,
            termsOfService: user.termsOfService,
            privacyPolicyConsent: user.privacyPolicyConsent,
            confidentialityAgreement: user.confidentialityAgreement,
            username: user.username,
          };
          let duration = autoLogin ? {} : { expiresIn: "12h" };

          jsonWebToken = jwt.sign(userInfo, JWT_SecretKey, duration);

          await UsersModel.updateOne(
            { email: email },
            { $set: { lastLogin: new Date() } }
          );

          res.status(200).json({
            status: 200,
            message: "login success",
            accesstoken: jsonWebToken,
            isAdmin: user.isAdmin,
          });
        }
      );
    }
  });
});

/*
 * 일반 회원가입
 * 법률정보 동의, 회원정보, 인증파일 입력
 */
router.post("/join", async (req, res) => {
  const {
    password,
    email,
    manager,
    companyName,
    username,
    project,
    department,
    phone,
  } = req.body;
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
      manager,
      companyName,
      username,
      project,
      department,
      phone,
      userType: "USER",
      termsOfService: null,
      privacyPolicyConsent: null,
      confidentialityAgreement: null,
    });

    await model.save();
    res.status(200).json({
      status: 200,
      message: "회원가입이 완료 되었습니다.",
    });
  });
});

/*
 * 회원가입
 * 법률정보 동의, 회원정보, 인증파일 입력
 */
router.post("/verify/email", async (req, res) => {
  let email = req.body.email;

  let user = await UsersModel.findOne({ email: email });
  if (user) {
    return res.json({
      status: 407,
      message: "이미 사용하고 있는 아이디 입니다. 다른 아이디를 사용해주세요",
    });
  }
  res.status(200).json({
    status: 200,
    success: true,
    message: "사용 가능한 아이디 입니다.",
  });
});

/**
 * 사용자 기본정보 확인
 * response 200 OK, data : 유저 개인정보
 */

router.get("/profile", verifyToken, async (req, res) => {
  try {
    let data = await UsersModel.findOne({ _id: req.userId }, { password: 0 })
      .lean()
      .exec();

    const survey = await BasicSurveyResponseModel.findOne({
      company: req.userId,
    })
      .sort({ createdAt: -1 }) // 최신 설문
      .lean()
      .exec();

    const advancedSurveys = await AdvancedSurveyResponseModel.find({
      author: req.userId,
    })
      .lean()
      .exec();

    const advancedSurveyIds = {};
    advancedSurveys.forEach((survey) => {
      if (survey.code) {
        advancedSurveyIds[survey.code] = survey._id;
      }
    });

    const formattedData = {
      _id: data._id,
      companyId: data._id,
      username: data.username,
      termsOfService: data.termsOfService,
      privacyPolicyConsent: data.privacyPolicyConsent,
      confidentialityAgreement: data.confidentialityAgreement,
      email: data.email,
      phone: data.phone,
      userType: data.userType,
      department: data.department,
      isAdmin: data.isAdmin,
      surveyId: survey?._id || null,
      advancedSurveyIds,
      userSurveyStatus: data.userSurveyStatus || "PENDING",
    };
    res.status(200).json({
      status: 200,
      message: "success",
      data: formattedData,
    });
  } catch (err) {
    console.log("err", err);
    return res.json({ status: 500, message: err.message });
  }
});

/**
 * 사용자 기본정보 수정
 * response 200 OK
 */

router.put("/profile", verifyToken, async (req, res) => {
  const { username, department, email, phone } = req.body;
  try {
    await UsersModel.updateOne(
      { _id: req.userId },
      {
        $set: {
          ...(username && { username }),
          ...(department && { department }),
          ...(email && { email }),
          ...(phone && { phone }),
        },
      }
      // { $set: { username: username } }
    );

    res.status(200).json({
      status: 200,
      message: "success",
    });
  } catch (err) {
    console.log("err", err);
    return res.json({ status: 500, message: err.message });
  }
});

/**
 * 사용자 기본정보 확인
 * response 200 OK, data : 유저 개인정보
 */

router.get("/profile/:id", async (req, res) => {
  try {
    let data = await UsersModel.findOne(
      { _id: req.params.id },
      { password: 0 }
    ).exec();

    res.status(200).json({ status: 200, data });
  } catch (err) {
    console.log("err", err);
    return res.status(500).json({ message: err.message });
  }
});

/**
 * ID(email) 찾기
 * request params : username, mobileNo
 * response params : email(아이디)
 */
router.post("/find/accountId", (req, res) => {
  let { username, weddingHall } = req.body;
  UsersModel.findOne(
    { username: username, weddingHall: weddingHall },
    async (err, user) => {
      if (err)
        return res.status(500).json({ error: true, message: "Server error" });

      if (user) {
        return res.status(200).json({
          status: 200,
          success: true,
          data: user.email,
        });
      } else {
        res.status(200).json({
          status: 409,
          success: false,
          message: "일치하는 정보가 없습니다.",
        });
      }
    }
  );
});

/**
 * password 분실시 비밀번호 초기화
 */
router.post("/resetPwd", (req, res) => {
  let { email } = req.body;
  UsersModel.findOne({ email: email }, async (err, user) => {
    if (err)
      return res.status(500).json({ error: true, message: "Server error" });

    if (user) {
      // let password = Math.random().toString(36).substr(2, 11);
      await UsersModel.updateOne({ email: email }, { $set: { password: "" } });
      return res.status(200).json({
        status: 200,
        success: true,
      });
    } else {
      res.status(200).json({
        status: 409,
        success: false,
        message: "일치하는 정보가 없습니다.",
      });
    }
  });
});

/**
 * 비밀번호 변경
 * body params :  password, newPassword
 */
router.put("/changePwd", verifyToken, async (req, res) => {
  let { password, newPassword } = req.body;
  let result = await UsersModel.findOne({
    _id: req.userId,
    password: sha256(password),
  });

  if (!result) {
    return res.status(200).json({
      status: 409,
      success: false,
      message: "현재 비밀번호가 다릅니다.",
    });
  }
  await UsersModel.updateOne(
    { _id: req.userId },
    { $set: { password: sha256(newPassword) } }
  );
  res.status(200).json({
    status: 200,
    success: true,
    message: "비밀번호 변경이 완료되었습니다.",
  });
});

/*
 * 회원탈퇴
 * 회원이 작성한 모든 게시물 삭제 및 외원 정보 삭제
 */
router.post("/withdraw", verifyToken, async (req, res) => {
  let data = {
    email: "",
    password: "",
    dropedAt: new Date(),
  };
  try {
    await UsersModel.updateOne({ _id: req.userId }, { $set: data }).exec();
    res.status(200).json({
      status: 200,
      message: "성공",
    });
  } catch (err) {
    console.log(err);
    res.json({
      status: 500,
      message: err.message,
    });
  }
});


module.exports = router;
