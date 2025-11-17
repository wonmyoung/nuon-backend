const express = require("express");
const SalesModel = require("../models/SalesModel");
const router = express.Router();


/**
 * Ping test
 */

router.get("/", (req, res) => {

  let options = {
    method: "GET",
    url: "쇼핑몰 IP주소",
  };

  request(options, async (error, response, data) => {
    if (error) throw new Error(error);
    try {
      result = await JSON.parse(data);

      input = {
        salesPrice: result.salesPrice,
        tax: result.tax,
        fee: result.fee,
        netPrice: result.netPrice,
      };
      let model = new SalesModel(input);
      await model.save();
      return res.json({ status: 200, success: true });
    } catch (err) {
      console.log("err", err.message);
      return res.json({ status: 500, error: true, message: err.message });
    }
  });

  res.status(200).json({ data: result, status: 200, success: true });
});



module.exports = router;
