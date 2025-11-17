const express = require("express");
const router = express.Router();


/**
 * Ping test
 */

router.get("/", (req, res) => {

  res.status(200).json({ data: 'hello won!', status: 200, success: true });
});



module.exports = router;
