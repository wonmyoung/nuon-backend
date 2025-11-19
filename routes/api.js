const express = require("express");
const router = express.Router();
const axios = require("axios");
const bcrypt = require("bcrypt");
const {
  NAVER_CLIENT_ID_HOMEKEEPING,
  NAVER_CLIENT_SECRET_HOMEKEEPING,
} = require("../config/env");

/**
 * Ping test
 */

router.get("/", (req, res) => {
  res.status(200).json({ data: "hello won!", status: 200, success: true });
});

/**
 * 네이버 - 토큰 발급
 */
async function getNaverToken() {
  try {
    const timestamp = Date.now().toString();
    const password = `${NAVER_CLIENT_ID_HOMEKEEPING}_${timestamp}`;
    const hashed = bcrypt.hashSync(password, NAVER_CLIENT_SECRET_HOMEKEEPING);
    const client_secret_sign = Buffer.from(hashed, "utf-8").toString("base64");

    const params = new URLSearchParams({
      client_id: NAVER_CLIENT_ID_HOMEKEEPING,
      timestamp: timestamp,
      client_secret_sign: client_secret_sign,
      grant_type: "client_credentials",
      type: "SELF",
    });

    let response = await axios({
      method: "post",
      maxBodyLength: Infinity,
      url: "https://api.commerce.naver.com/external/v1/oauth2/token",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      data: params.toString(),
    });

    return response.data.access_token;
  } catch (err) {
    console.error("Naver token error:", err.message);
    throw err;
  }
}

/**
 * 네이버 - 건별 부가세 내역
 */
router.get("/naver/vat", async (req, res) => {
  const { startDate, endDate, pageNumber, pageSize } = req.query;

  try {
    // 먼저 토큰 발급
    const accessToken = await getNaverToken();

    let response = await axios({
      method: "get",
      maxBodyLength: Infinity,
      url: "https://api.commerce.naver.com/external/v1/pay-settle/vat/case",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      params: {
        startDate: startDate,
        endDate: endDate,
        pageNumber: pageNumber,
        pageSize: pageSize,
      },
    });

    return res.status(200).json({
      status: 200,
      success: true,
      data: response.data,
    });
  } catch (err) {
    console.error("Naver VAT API error:", err.message);
    console.error("Error details:", err.response?.data);
    return res.status(400).json({
      status: 400,
      success: false,
      error: err.message,
      details: err.response?.data || null,
    });
  }
});

/**
 * 네이버 - 건별 정산 내역
 * 상품명기준으로 조회할 수 있는 API
 * 날짜 항목을 searchDate 하나만 받고 있어서, 매일 조회되어야함.
 *
 *
 */
router.get("/naver/settle", async (req, res) => {
  const { searchDate, pageNumber, pageSize } = req.query;

  try {
    const accessToken = await getNaverToken();

    let response = await axios({
      method: "get",
      maxBodyLength: Infinity,
      url: "https://api.commerce.naver.com/external/v1/pay-settle/settle/case",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      params: {
        searchDate: searchDate,
        periodType: "SETTLE_CASEBYCASE_SETTLE_SCHEDULE_DATE",
        // periodType: 조회 기간 기준
        // SETTLE_CASEBYCASE_SETTLE_SCHEDULE_DATE(정산 예정일)
        // SETTLE_CASEBYCASE_SETTLE_BASIS_DATE(정산 기준일)
        // SETTLE_CASEBYCASE_SETTLE_COMPLETE_DATE(정산 완료일)
        // SETTLE_CASEBYCASE_PAY_DATE(결제일)
        // SETTLE_CASEBYCASE_TAXRETURN_BASIS_DATE(세금 신고 기준일)
        pageNumber: pageNumber,
        pageSize: pageSize, // 최대 1000
      },
    });

    const transformedData = response.data.elements.map((item) => ({
      salePrice: item.paySettleAmount, // 판매가
      saleNetPrice: 0, // 판매 공급가 - 수정해야함
      saleVat: 0, // 판매 부가세 - 수정해야함
      //수수료
      commissionAmount:
        item.totalPayCommissionAmount + item.sellingInterlockCommissionAmount,
      // totalPayCommissionAmount : 네이버페이주문관리
      // sellingInterlockCommissionAmount : 매출연동수수료
      settlementAmount: item.settleExpectAmount, // 정산금액
    }));

    return res.status(200).json({
      status: 200,
      success: true,
      data: response.data,
    });
  } catch (err) {
    console.error("error:", err.message);
    console.error("Error details:", err.response?.data);
    return res.status(400).json({
      status: 400,
      success: false,
      error: err.message,
      details: err.response?.data || null,
    });
  }
});

module.exports = router;
