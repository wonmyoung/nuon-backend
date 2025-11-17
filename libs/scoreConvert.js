module.exports = function scoreConvert(value) {
  switch (value) {
    case 1:
      return 0;
    case 2:
      return 33;
    case 3:
      return 67;
    case 4:
      return 100;
    default:
      return null; // 값이 1~4가 아닐 때
  }
};
