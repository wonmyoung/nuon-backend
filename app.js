/** 환경 설정 기본 값 */

const express = require("express");
const logger = require("morgan");
const helmet = require("helmet");

//swagger 모듈
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

//MongoDB 접속
const mongoose = require("mongoose");
mongoose.Promise = global.Promise;
mongoose.set("strictQuery", true);
const clientOptions = {
  serverApi: { version: "1", strict: true, deprecationErrors: false },
};
const db = mongoose.connection;
db.on("error", console.error);
db.once("open", function (data) {
  console.log("mongodb connect");
});

mongoose.connect(
  "mongodb+srv://wonmyoung:gHivJEaV2mZMehW0@cluster0.5ls63lo.mongodb.net/nuon?retryWrites=true&w=majority&appName=Cluster0"
);
const routes = require("./routes/index");
const admin = require("./routes/admin");
const accounts = require("./routes/accounts");
const file = require("./routes/file");
const sales = require("./routes/sales");
const advertise = require("./routes/advertise");
const api = require("./routes/api");
const cors = require("cors");

const app = express();

const port = process.env.port || 30001;

// 미들웨어 셋팅
app.use(logger("dev"));
app.use(cors());
app.use(express.json({ limit: "300mb" }));
app.use(express.urlencoded({ limit: "300mb", extended: false }));
app.use(helmet());
// Swagger 설정
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "뉴온 매출 관리 솔루션",
      version: "1.0.0",
      description: "벡엔드 API 문서",
    },
    servers: [
      {
        url: `http://localhost:${port}`,
      },
    ],
  },
  apis: [path.join(__dirname, "routes/*.js")],
};

// Swagger 문서 생성
const swaggerDocs = swaggerJsdoc(swaggerOptions);

// Routing
app.use("/", routes); //  render
app.use("/api", api);
app.use("/admin", admin);
app.use("/accounts", accounts);
app.use("/file", file);
app.use("/sales", sales);
app.use("/advertise", advertise);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.listen(port, async function () {
  console.log("Express listening on port", port);
});

module.exports = app;
