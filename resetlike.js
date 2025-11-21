const fs = require("fs");
const path = "./data/novels.json";

const novels = JSON.parse(fs.readFileSync(path, "utf8"));

for (let n of novels) {
  n.likes = 0;
}

fs.writeFileSync(path, JSON.stringify(novels, null, 2));
console.log("likes 값 초기화 완료!");
