const path = require("path");

module.exports = {
  GENERATE: path.join(__dirname, "pages", "./role-generator"),
  RATE: path.join(__dirname, "pages", "./role-rator"),
  PAGE_404: path.join(__dirname, "pages", "./404"),
  LOGIN: path.join(__dirname, "pages", "./login"),
  WAIT_ROOM: path.join(__dirname, "pages", "./role-none"),
  ADMIN: path.join(__dirname, "pages", "./role-admin"),
  INFER: path.join(__dirname, "pages", "./infer"),
  LANDING_PAGE: path.join(__dirname, "pages", "./landing"),
  SHARED_FILES: path.join(__dirname, "pages", "./shared"),
};
