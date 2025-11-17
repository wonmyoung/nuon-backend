let jwt = require("jsonwebtoken");
const { JWT_SecretKey } = require("../config/env");

function verifyToken(req, res, next) {
  let token = req.headers["authorization"];
  console.log("token >>>>", token);

  /*
 let token;
 let bearerHeader = req.headers['authorization']
  console.log("req.headers : ", bearerHeader)

  if(typeof bearerHeader !=="undefined"){

    token = bearerHeader.split("");

  }
*/

  if (!token)
    return res
      .status(403)
      .send({ status: 403, auth: false, message: "접근 권한이 없습니다." });

  jwt.verify(token, JWT_SecretKey, function (err, decoded) {
    console.log("decoded err", err);
    if (err)
      return res
        .status(200)
        .json({ status: 407, auth: false, message: "아이디와 비밀번호를 다시 확인 하세요" });

    console.log("decoded", decoded);
    req.userId = decoded._id;
    next();
  });
}

module.exports = verifyToken;

// const jwt = require("jsonwebtoken");
// const { JWT_SecretKey } = require("../config/env");

// function verifyToken(req, res, next) {
//   const bearerHeader = req.headers["authorization"];

//   if (!bearerHeader || !bearerHeader.startsWith("Bearer ")) {
//     return res.status(403).json({
//       status: 403,
//       auth: false,
//       message: "토큰이 없거나 형식이 잘못되었습니다.",
//     });
//   }

//   const token = bearerHeader.split(" ")[1];

//   jwt.verify(token, JWT_SecretKey, function (err, decoded) {
//     console.log("🧪 decoded err:", err);
//     if (err) {
//       return res.status(200).json({
//         status: 407,
//         auth: false,
//         message: "토큰이 유효하지 않습니다.",
//       });
//     }

//     console.log("✅ decoded:", decoded);
//     req.accountId = decoded.accountId;
//     req.userId = decoded._id;
//     next();
//   });
// }

// module.exports = verifyToken;