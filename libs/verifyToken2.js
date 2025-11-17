let jwt = require("jsonwebtoken");
const { JWT_SecretKey } = require("../config/env");

function verifyToken2(req, res, next) {
  console.log("req.headers", req.headers);
  let token = req.headers["authorization"];
  /*
   let token;
   let bearerHeader = req.headers['authorization']
    console.log("req.headers : ", bearerHeader)
  
    if(typeof bearerHeader !=="undefined"){
  
      token = bearerHeader.split("");
  
    }
  */
  console.log("token : ", token);
  if (token != "null" || token != "" || token != null || token != 'undefined') {
    jwt.verify(token, JWT_SecretKey, function (err, decoded) {
      if (err)
        return res.status(500).send({
          auth: false,
          message: "아이디와 비밀번호를 다시 확인 하세요",
        });
      req.accountId = decoded.accountId;
      req.username = decoded.username;
      req.userId = decoded._id;

    });
  } else {
    req.accountId = null;
    req.userId = null;
  }
  next();
}

module.exports = verifyToken2;
