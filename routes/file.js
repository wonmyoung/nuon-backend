const express = require("express");
const router = express.Router();
const awsconfig = require("../config/awsconfig");
const multer = require("multer");
const multerS3 = require("multer-s3");
const AWS = require("aws-sdk");
const verifyToken = require("../libs/verifyToken");
const UsersModel = require("../models/UsersModel");

AWS.config.update({
  region: awsconfig.region,
  credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: awsconfig.IdentityPoolId,
  }),
});

const s3 = new AWS.S3({
  apiVersion: "2012-10-17",
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
      if (file.fieldname === "thumbnail") {
        callback(
          null,
          "images/thumbnail-" + Date.now() + "." + file.mimetype.split("/")[1]
        );
      } else if (file.fieldname === "images") {
        callback(
          null,
          "images/image-" + Date.now() + "." + file.mimetype.split("/")[1]
        );
      } else {
        callback(
          null,
          "images/image-" + Date.now() + "." + file.mimetype.split("/")[1]
        );
      }
    },
    acl: "public-read-write",
    sslEnabled: true,
    limits: { fileSize: 1024 * 1024 * 300 }, //업로드 용량 제한 500MB
  }),
});

router.post("/upload", upload.single("file"), async (req, res) => {
  let url = req.file ? req.file.location : "";

  try {
    return res.status(200).json({ status: 200, message: "success", url });
  } catch (err) {
    console.log(err);
    res.json({ status: 500, message: err.message });
  }
});

/*  이미지 삭제 요청 처리 */
router.delete("/", verifyToken, async (req, res) => {
  try {
    // 프론트에서 ?filename=... 으로 보내는 것과
    // 과거 ?url=... 둘 다 지원
    const raw = (req.query.filename || req.query.url || "").toString().trim();
    if (!raw) {
      return res
        .status(400)
        .json({ status: 400, message: "filename 또는 url이 필요합니다." });
    }

    // 전체 URL이든 Key든 다 처리
    let key = "";
    try {
      if (/^https?:\/\//i.test(raw)) {
        const u = new URL(raw);
        // '/images/image-xxx.png' -> 'images/image-xxx.png'
        key = decodeURIComponent(u.pathname).replace(/^\/+/, "");
      } else {
        // 이미 'images/...' 같은 Key가 넘어온 경우
        key = decodeURIComponent(raw).replace(/^\/+/, "");
      }
    } catch (e) {
      // URL 파싱 실패 시 fallback: 마지막 수단으로 슬래시 split
      key = raw.split("?")[0].split("#")[0].replace(/^\/+/, "");
    }

    if (!key) {
      return res
        .status(400)
        .json({ status: 400, message: "삭제할 S3 Key를 파싱하지 못했습니다." });
    }

    const params = {
      Bucket: awsconfig.Bucket,
      Key: key, // ✅ 'images/파일명.확장자'까지 포함해야 함
    };

    s3.deleteObject(params, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ status: 500, message: err.message });
      }
      return res.status(200).json({ status: 200, success: true });
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: 500, message: err.message });
  }
});

router.delete("/report", async (req, res) => {
  try {
    // 프론트에서 ?filename=... 또는 ?url=... 로 전달
    const raw = (req.query.filename || req.query.url || "").toString().trim();
    if (!raw) {
      return res
        .status(400)
        .json({ status: 400, message: "filename 또는 url이 필요합니다." });
    }

    // 전체 URL이든 Key든 다 처리
    let key = "";
    try {
      if (/^https?:\/\//i.test(raw)) {
        const u = new URL(raw);
        // '/images/image-xxx.png' -> 'images/image-xxx.png'
        key = decodeURIComponent(u.pathname).replace(/^\/+/, "");
      } else {
        // 이미 'images/...' 같은 Key가 넘어온 경우
        key = decodeURIComponent(raw).replace(/^\/+/, "");
      }
    } catch (e) {
      // URL 파싱 실패 시 fallback
      key = raw.split("?")[0].split("#")[0].replace(/^\/+/, "");
    }

    if (!key) {
      return res
        .status(400)
        .json({ status: 400, message: "삭제할 S3 Key를 파싱하지 못했습니다." });
    }

    const params = {
      Bucket: awsconfig.Bucket,
      Key: key, // 예: 'images/image-123.png'
    };

    s3.deleteObject(params, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ status: 500, message: err.message });
      }
      return res.status(200).json({ status: 200, success: true });
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: 500, message: err.message });
  }
});
// router.delete("/", verifyToken, (req, res) => {
//   let arr = req.query.url.split("/");
//   let filename = arr[arr.length - 1];
//   let params = {
//     Bucket: awsconfig.Bucket,
//     Key: filename,
//   };

//   s3.deleteObject(params, async (err) => {
//     if (err) return res.json({ status: 500, err: true });

//     return res.status(200).json({ status: 200, success: true });
//   });
// });

module.exports = router;
