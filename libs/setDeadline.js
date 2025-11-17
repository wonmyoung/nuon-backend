module.exports = function setDeadline(weddingDate, week, day) {
  // 요일 문자열을 숫자로 변환 (0: 일요일, 1: 월요일, ..., 6: 토요일)
  const dayMap = {
    '일': 0,
    '월': 1,
    '화': 2,
    '수': 3,
    '목': 4,
    '금': 5,
    '토': 6,
  };

  const targetDay = dayMap[day];


  // 기준 날짜 복사
  const baseDate = new Date(weddingDate);
  baseDate.setHours(0, 0, 0, 0);

  // 기준 날짜에서 N주(7일 * N) 전으로 이동
  const targetDate = new Date(baseDate);
  targetDate.setDate(targetDate.getDate() - (7 * week));

  // targetDate의 요일과 일치하도록 날짜 보정
  const currentDay = targetDate.getDay(); // 0(일)~6(토)
  const diff = targetDay - currentDay;
  targetDate.setDate(targetDate.getDate() + diff);

  return targetDate;
}

