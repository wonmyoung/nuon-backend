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
const BasicSurveyResponseModel = require("../models/BasicSurveyResponseModel");
const AdvancedSurveyResponseModel = require("../models/AdvancedSurveyResponseModel");
const AdvancedSurveyQuestionModel = require("../models/AdvancedSurveyQuestionModel");
const ConsultantModel = require("../models/ConsultantModel");

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
    consultantSurveyStatus,
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

  if (consultantSurveyStatus && consultantSurveyStatus !== "") {
    query.consulantSurveyStatus = consultantSurveyStatus;
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

/**
 * 설문 리스트
 * response 200 OK
 */
router.get(
  "/survey/advanced/list",
  verifyToken,
  adminRequired,
  async (req, res) => {
    const { page = 1, limit = 10, searchWord, inputMode } = req.query;

    let query = {};

    if (searchWord && inputMode === "question") {
      const regex = new RegExp(searchWord, "i");
      query.$or = [];

      for (let i = 1; i <= 5; i++) {
        const key = `question_0${i}`;
        query.$or.push(
          { [`${key}.ko.question`]: { $regex: regex } },
          { [`${key}.en.question`]: { $regex: regex } }
        );
      }
    }

    try {
      const count = await AdvancedSurveyQuestionModel.find(query).count();
      const data = await AdvancedSurveyQuestionModel.find(query)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ createdAt: -1 })
        .exec();

      res.json({
        status: 200,
        data,
        total: count,
        page: page,
      });
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: true, message: err });
    }
  }
);

/**
 *  설문 조회
 * response 200 OK
 */
router.get("/survey/question/:id", verifyToken, async (req, res) => {
  try {
    let data = await AdvancedSurveyQuestionModel.findById(req.params.id).lean();

    res.status(200).json({ status: 200, data });
  } catch (err) {
    console.log("err", err);
    return res.status(500).json({ message: err.message });
  }
});

/**
 * 설문 문항 등록
 * response 200 OK
 */

router.post("/survey/question", verifyToken, async (req, res) => {
  let {
    title,
    category,
    code,
    question_01,
    question_02,
    question_03,
    question_04,
    question_05,
  } = req.body;
  try {
    let data = {
      user: req.userId, //question model에서는 질문지를 만든사람만 알면됨.
      title,
      category,
      code,
      question_01,
      question_02,
      question_03,
      question_04,
      question_05,
    };
    let model = new AdvancedSurveyQuestionModel(data);
    model.save();

    res.status(200).json({ status: 200 });
  } catch (err) {
    console.log("err", err);
    return res.status(500).json({ message: err.message });
  }
});

/**
 *  설문 수정
 * response 200 OK
 */
router.put("/survey/question", verifyToken, async (req, res) => {
  let {
    surveyId,
    title,
    category,
    code,
    question_01,
    question_02,
    question_03,
    question_04,
    question_05,
  } = req.body;

  try {
    let data = {
      user: req.userId,
      title,
      category,
      code,
      question_01,
      question_02,
      question_03,
      question_04,
      question_05,
      updatedAt: new Date(),
    };
    await AdvancedSurveyQuestionModel.updateOne(
      { _id: surveyId },
      { $set: data }
    );

    res.status(200).json({ status: 200 });
  } catch (err) {
    console.log("err", err);
    return res.status(500).json({ message: err.message });
  }
});

/**
 * 기본 설문 조회
 */
router.get("/survey/basic/:surveyId", verifyToken, async (req, res) => {
  try {
    let data = await BasicSurveyResponseModel.findById(
      req.params.surveyId
    ).lean();

    res.status(200).json({ status: 200, data });
  } catch (err) {
    console.log("err", err);
    return res.status(500).json({ message: err.message });
  }
});

/**
 * 기본 설문 삭제
 */
router.delete("/survey/basic/:surveyId", verifyToken, async (req, res) => {
  try {
    let survey = await BasicSurveyResponseModel.findById(req.params.surveyId);
    if (survey.author != req.userId) {
      return res.json({
        status: 403,
        error: true,
        message: "삭제 권한이 없습니다.",
      });
    }
    await BasicSurveyResponseModel.deleteOne({ _id: req.params.surveyId });

    res.status(200).json({ status: 200, success: true });
  } catch (err) {
    return res.json({ status: 500, error: true, message: err.message });
  }
});

/**
 * 컨설턴트 정보 조회
 * response 200 OK
 */
router.get("/consultant/:companyId", verifyToken, async (req, res) => {
  try {
    const query = {
      company: req.params.companyId,
    };

    const data = await ConsultantModel.findOne(query).lean();

    res.json({
      status: 200,
      data,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: true, message: err });
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
      UsersModel.countDocuments({ isAdmin: false, createdAt: { $gte: thisMonth } }), //이번달 가입 기업수
    ]);

    const totalUser = data[0];
    const yearJoinUser = data[1];
    const monthJoinUser = data[2];

    // headOffice별 카운트
    const headOfficeStats = await BasicSurveyResponseModel.aggregate([
      {
        $group: {
          _id: "$headOffice",
          count: { $sum: 1 },
        },
      },
    ]);

    // headOffice 통계를 객체로 변환
    const headOfficeCount = {
      seoul: 0,
      gyeonggi: 0,
      chungcheong: 0,
      honam: 0,
      yeongnam: 0,
      gangwon: 0,
      jeju: 0,
      overseas: 0,
      etc: 0,
    };

    headOfficeStats.forEach((stat) => {
      if (headOfficeCount.hasOwnProperty(stat._id)) {
        headOfficeCount[stat._id] = stat.count;
      }
    });

    // industries별 카운트
    const industriesStats = await BasicSurveyResponseModel.aggregate([
      {
        $unwind: "$industries",
      },
      {
        $group: {
          _id: "$industries",
          count: { $sum: 1 },
        },
      },
    ]);

    // industries 통계를 객체로 변환
    const industriesCount = {
      ict: 0,
      bio: 0,
      machine: 0,
      electronics: 0,
      energy: 0,
      contents: 0,
      design: 0,
      distribution: 0,
      agriculture: 0,
      education: 0,
      tourism: 0,
      fashion: 0,
      finance: 0,
      realestate: 0,
      etc: 0,
    };

    industriesStats.forEach((stat) => {
      if (industriesCount.hasOwnProperty(stat._id)) {
        industriesCount[stat._id] = stat.count;
      }
    });

    res.json({
      status: 200,
      totalUser,
      yearJoinUser,
      monthJoinUser,
      headOfficeCount,
      industriesCount,
    });
  } catch (err) {
    console.log(err);
    res.json({ status: 500, error: true, message: err });
  }
});

router.get("/dashboard/survey", async (req, res) => {
  try {
    // 전체 설문 수
    const totalSurvey = await BasicSurveyResponseModel.countDocuments({
      status: { $in: ["WORKING", "COMPLETE"] },
    });

    // 완료된 설문 수
    const surveyComplete = await BasicSurveyResponseModel.countDocuments({
      status: "COMPLETE",
    });

    res.json({
      status: 200,
      totalSurvey,
      surveyComplete,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: 500,
      error: true,
      message: err.message,
    });
  }
});

/**
 * 전체 응답 데이터 엑셀 다운로드 (Advanced만)
 * response 200 OK
 */
router.get("/response/excel/advanced/all", verifyToken, async (req, res) => {
  try {
    const advancedList = await AdvancedSurveyResponseModel.find({ type: "COMPANY" }).sort({ createdAt: -1 }).lean();

    const companyMap = new Map();

    // 그룹화
    advancedList.forEach((adv) => {
      if (adv.company) {
        const companyId = adv.company.toString();
        if (!companyMap.has(companyId)) {
          companyMap.set(companyId, []);
        }
        companyMap.get(companyId).push(adv);
      }
    });

    const data = [];

    companyMap.forEach((advList, companyId) => {
      if (advList.length === 10) {
        data.push({
          companyId,
          responses: advList,
        });
      }
    });

    res.json({ status: 200, data, total: data.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: err.message });
  }
});

/**
 * 개별 응답 데이터 엑셀 다운로드 (Advanced만)
 * response 200 OK
 */
router.get(
  "/survey/advanced/all",
  verifyToken,
  adminRequired,
  async (req, res) => {
    try {
      const data = await AdvancedSurveyQuestionModel.find()
        .sort({ createdAt: -1 })
        .lean();
      res.json({
        status: 200,
        data,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: true, message: err.message });
    }
  }
);

router.get(
  "/response/excel/advanced/:companyId",
  verifyToken,
  async (req, res) => {
    try {
      const advancedList = await AdvancedSurveyResponseModel.find({
        company: req.params.companyId,
        type: "COMPANY",
      }).lean();
      console.log("advancedList", advancedList);

      if (!advancedList || advancedList.length === 0) {
        return res.status(404).json({
          status: 404,
          error: true,
          message: "해당 회사의 심화 설문 데이터를 찾을 수 없습니다.",
        });
      }

      // 배열의 모든 객체를 하나로 병합
      const data = advancedList;
      res.json({
        status: 200,
        data,
      });
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: true, message: err.message });
    }
  }
);

/**
 * 전체 응답 데이터 엑셀 다운로드
 * response 200 OK
 */
router.get("/response/excel/basic/all", verifyToken, async (req, res) => {
  try {
    // const data = await BasicSurveyResponseModel.find().lean();
    const data = await BasicSurveyResponseModel.find({
      status: "COMPLETE",
    }).lean();
    res.json({
      status: 200,
      data,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: true, message: err.message });
  }
});

/**
 * 개별 응답 데이터 엑셀 다운로드
 * response 200 OK
 */
router.get(
  "/response/excel/basic/:companyId",
  verifyToken,
  async (req, res) => {
    try {
      const companyId = req.params.companyId;

      const data = await BasicSurveyResponseModel.findOne({
        company: companyId,
      }).lean();

      res.json({
        status: 200,
        data,
      });
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: true, message: err.message });
    }
  }
);

module.exports = router;
