module.exports = function (req, res, next) {
  if (req.id == 1 || req.id == 2 || req.id == 3) {
    next();
  } else {
    next();

    // return res
    //   .status(200)
    //   .json({ status: 409, message: "접근 권한이 없습니다." });
  }
};
