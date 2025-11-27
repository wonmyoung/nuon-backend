const express = require("express");
const router = express.Router();
const axios = require("axios");
const bcrypt = require("bcrypt");
const TokenModel = require("../models/TokenMoel");

const {
  NAVER_CLIENT_ID_HOMEKEEPING,
  NAVER_CLIENT_SECRET_HOMEKEEPING,
  CAFE24_MALL_ID,
  CAFE24_REDIRECT_URI,
  CAFE24_CLIENT_ID,
  CAFE24_CLIENT_SECRET,
  LOTTEON_API_KEY,
  SSG_API_KEY,
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

/**
 * 네이버 - 건별 정산 내역
 * 상품명기준으로 조회할 수 있는 API
 * 날짜 항목을 searchDate 하나만 받고 있어서, 매일 조회되어야함.
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

    const grouped = response.data.elements.reduce((acc, item) => {
      const key = item.productName;

      if (!acc[key]) {
        acc[key] = {
          productName: key,
          salesPrice: 0, // 판매가
          salesNetPrice: 0, // 판매 공급가
          salesVat: 0, // 판매 부가세
          commision: 0, // 수수료
          settlementAmount: 0, // 정산금액
        };
      }

      acc[key].salesPrice += Number(item.paySettleAmount);
      acc[key].commision +=
        Number(-item.totalPayCommissionAmount) +
        Number(-item.sellingInterlockCommissionAmount);
      acc[key].settlementAmount += Number(item.settleExpectAmount);

      return acc;
    }, {});

    Object.values(grouped).forEach((group) => {
      group.salesNetPrice = Math.floor(group.salesPrice / 1.1); // 판매 공급가
      group.salesVat = group.salesPrice - group.salesNetPrice; // 판매 부가세
    });

    const resultList = Object.values(grouped);

    return res.status(200).json({
      status: 200,
      success: true,
      data: resultList,
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
/**
 * CAFE24 - 최초 1회 토큰 생성
 */
router.post("/cafe24/token", async (req, res) => {
  try {
    const { code } = req.body;
    console.log("code", code);

    const auth = Buffer.from(
      `${CAFE24_CLIENT_ID}:${CAFE24_CLIENT_SECRET}`
    ).toString("base64");

    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", CAFE24_REDIRECT_URI);

    const tokenResponse = await axios.post(
      `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/oauth/token`,
      params.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${auth}`,
        },
      }
    );

    const token = tokenResponse.data;

    await TokenModel.updateOne(
      { mallId: CAFE24_MALL_ID },
      {
        $set: {
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          expires_at: new Date(token.expires_at).getTime(),
          refresh_expires_at: new Date(
            token.refresh_token_expires_at
          ).getTime(),
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return res.status(200).json({
      status: 200,
      success: true,
      data: tokenResponse.data,
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

/**
 * CAFE24 -  리프레시 토큰으로 액세스 토큰 재발급
 */
async function refreshAccessToken() {
  const tokenData = await TokenModel.findOne({ mallId: CAFE24_MALL_ID });

  if (!tokenData) {
    throw new Error("Refresh token not found. Please authenticate first.");
  }

  const refreshToken = tokenData.refresh_token;

  try {
    const auth = Buffer.from(
      `${CAFE24_CLIENT_ID}:${CAFE24_CLIENT_SECRET}`
    ).toString("base64");

    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", refreshToken);

    const response = await axios.post(
      `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/oauth/token`,
      params.toString(),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const newToken = response.data;

    const updateData = {
      access_token: newToken.access_token,
      expires_at: Date.now() + newToken.expires_in * 1000,
      updatedAt: new Date(),
    };

    if (newToken.refresh_token) {
      updateData.refresh_token = newToken.refresh_token;
    }

    if (newToken.refresh_token_expires_in) {
      updateData.refresh_expires_at =
        Date.now() + newToken.refresh_token_expires_in * 1000;
    }

    await TokenModel.updateOne(
      { mallId: CAFE24_MALL_ID },
      { $set: updateData }
    );

    return newToken.access_token;
  } catch (err) {
    console.error("Failed to refresh access_token:", err.response?.data);
    throw err;
  }
}

/**
 * CAFE24 - 유효한 액세스 토큰 확인 및 갱신
 */
async function getValidAccessToken() {
  const tokenData = await TokenModel.findOne({ mallId: CAFE24_MALL_ID });

  if (!tokenData) {
    throw new Error("Cafe24 token not found. Please authenticate first.");
  }

  if (Date.now() < tokenData.expires_at - 5000) {
    return tokenData.access_token;
  }

  const newAccessToken = await refreshAccessToken();

  return newAccessToken;
}

/**
 * CAFE24 - 주문 내역 조회
 */
router.get("/cafe24/orders", async (req, res) => {
  const { start_date, end_date, limit = 1000, offset = 0 } = req.query;

  try {
    const accessToken = await getValidAccessToken();

    let response = await axios.get(
      `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/admin/orders`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        params: {
          start_date,
          end_date,
          limit,
          offset,
        },
      }
    );

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

async function retryRequest(fn, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;

      console.log(`🔁 Retry ${i + 1}/${retries}...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * 롯데온 - 매출액&수수료
 */
router.get("/lotteon/sales", async (req, res) => {
  try {
    let response = await axios.post(
      "https://openapi.lotteon.com/v1/openapi/settle/v1/se/SettleItmdSales",
      {
        startDate: "20250901",
        endDate: "20250930",
      },
      {
        headers: {
          Authorization: `Bearer ${LOTTEON_API_KEY}`,
          Accept: "application/json",
          "Accept-Language": "ko",
          "X-Timezone": "GMT+09:00",
          "Content-Type": "application/json",
        },
      }
    );

    const resultData = response.data.data;
    const list = Array.isArray(resultData) ? resultData : [resultData];
    const grouped = list.reduce((acc, raw) => {
      const item = {
        slQty: Number(raw.slQty),
        slAmt: Number(raw.slAmt),
        slrDcAmt: Number(raw.slrDcAmt),
        pdDcOcoAmt: Number(raw.pdDcOcoAmt),
        pdDcSlrAmt: Number(raw.pdDcSlrAmt),
        dvSeAmt: Number(raw.dvSeAmt),
        dvDcOcoAmt: Number(raw.dvDcOcoAmt),
        dvDcSlrAmt: Number(raw.dvDcSlrAmt),
        bseCmsn: Number(raw.bseCmsn),
        pcsCmsn: Number(raw.pcsCmsn),
        dvCmsn: Number(raw.dvCmsn),
        ajstDcAmt: Number(raw.ajstDcAmt),
        pymtAmt: Number(raw.pymtAmt),
        spdNm: raw.spdNm,
      };
      const key = item.spdNm;

      if (!acc[key]) {
        acc[key] = {
          productName: key,
          salesPrice: 0, //판매가
          salesNetPrice: 0, //판매공급가
          salesVat: 0, //판매부가세
          commision: 0, //수수료
          commisionNetPrice: 0, //수수료공급가
          commisionVat: 0, //수수료부가세
          settlementAmount: 0, //정산금액
          deduction: 0, //공제금액
          deliveryFee: 0, //배송비
        };
      }

      acc[key].salesPrice +=
        item.slQty * item.slAmt -
        (item.slrDcAmt + item.pdDcOcoAmt + item.pdDcSlrAmt) +
        item.dvSeAmt -
        (item.dvDcOcoAmt + item.dvDcSlrAmt); // 정산대상판매가 : 판매건수*판매단가 - (셀러즉시할인+상품할인(셀러부담)+상품할인(이커머스부담)) + 배송비정산대상 - (배송비할인(셀러부담)+배송비할인(이커머스부담))
      acc[key].commision +=
        -(item.bseCmsn + item.pcsCmsn + item.dvCmsn) + item.ajstDcAmt; //기본수수료+PCS수수료+배송비수수료-조정(할인)
      acc[key].settlementAmount += item.pymtAmt; // 지급대상금액

      return acc;
    }, {});

    Object.values(grouped).forEach((group) => {
      group.salesNetPrice = Math.round(group.salesPrice / 1.1); // 판매 공급가
      group.salesVat = group.salesPrice - group.salesNetPrice; // 판매 부가세
      group.commisionNetPrice = Math.round(group.commision / 1.1); // 수수료 공급가
      group.commisionVat = group.commision - group.commisionNetPrice; // 수수료 부가세
    });

    const resultList = Object.values(grouped);

    return res.status(200).json({
      status: 200,
      success: true,
      data: resultList,
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

/**
 * SSG - 매출액&수수료
 */
router.get("/ssg/sales", async (req, res) => {
  const { date } = req.query;

  try {
    let response = await axios.get(
      `https://eapi.ssgadm.com/api/settle/v1/ven/sales/list.ssg`,
      {
        headers: {
          Authorization: SSG_API_KEY,
          "Content-Type": "application/json",
        },
        params: {
          critnDt: "20250727",
        },
      }
    );

    const resultData = response.data.result.resultData;
    const list = Array.isArray(resultData) ? resultData : [resultData];
    const grouped = list.reduce((acc, item) => {
      const key = item.itemNm;

      if (!acc[key]) {
        acc[key] = {
          productName: key,
          salesPrice: 0, //판매가
          salesNetPrice: 0, //판매공급가
          salesVat: 0, //판매부가세
          commision: 0, //수수료
          commisionNetPrice: 0, //수수료공급가
          commisionVat: 0, //수수료부가세
          settlementAmount: 0, //정산금액
          deduction: 0, //공제금액
          deliveryFee: 0, //배송비
        };
      }

      acc[key].salesPrice += Number(item.netAmt); //netAmt : 순판매액
      acc[key].commision += Number(-item.sellFee); // sellFee : 판매수수료
      acc[key].settlementAmount += Number(item.settlAmt); // settlAmt : 정산금액
      acc[key].deliveryFee += Number(item.dvShppcstAmt);

      return acc;
    }, {});

    Object.values(grouped).forEach((group) => {
      group.salesNetPrice = Math.round(group.salesPrice / 1.1); // 판매 공급가
      group.salesVat = group.salesPrice - group.salesNetPrice; // 판매 부가세
      group.commisionNetPrice = Math.round(group.commision / 1.1); // 수수료 공급가
      group.commisionVat = group.commision - group.commisionNetPrice; // 수수료 부가세
    });

    const resultList = Object.values(grouped);

    return res.status(200).json({
      status: 200,
      success: true,
      data: resultList,
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
