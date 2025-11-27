const path = require("path");
const fs = require("fs");
const express = require("express");
const bcrypt = require("bcrypt");
const session = require("express-session");
const uuid = require("uuid");
const multer = require("multer"); // 1. Multer 추가////////////////////////////////////////////////////
const mysql = require("mysql2/promise"); // 🔥 mysql2의 Promise API 로드

// -------------------- 🔥 DB 연결 설정 (이 부분을 수정) --------------------
const dbConfig = {
    host: "localhost", // 보통 'localhost' 또는 DB 서버 주소
    user: "root", // MySQL 설치 시 설정한 사용자 이름
    password: "@Chaco4747", // 🔑 MySQL 설치 시 설정한 비밀번호
    database: "novel_site", // 💡 'webnovel_app' -> 'novel_site'로 변경
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
};


// const dbConfig = {
//     host: "novel-site-db.cfsq62iae7qt.ap-southeast-2.rds.amazonaws.com", // 보통 'localhost' 또는 DB 서버 주소
//     user: "admin", // MySQL 설치 시 설정한 사용자 이름
//     password: "Chaco4747", // 🔑 MySQL 설치 시 설정한 비밀번호
//     database: "novel_site", // 💡 'webnovel_app' -> 'novel_site'로 변경
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0,
// };


// Connection Pool 생성
const db = mysql.createPool(dbConfig);
// --------------------------------------------------------------------------

const app = express();

//////////////////////////////////////////////////////////////////////////////////////////////////////
/* -------------------- Multer 설정 (이미지 업로드) -------------------- */
// 🔥 주의: 실제 운영 환경에서는 이 'temp_uploads' 폴더가 존재해야 하며,
// 파일 시스템에 실제로 파일을 저장하는 로직이 필요합니다.

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // 임시 업로드 폴더 (실제 서비스에서는 S3 등 클라우드 스토리지를 사용해야 합니다)
        // 로컬 환경 테스트를 위해 'pages/uploads' 경로를 가정합니다.
        // 이 코드는 파일 저장 경로를 시뮬레이션합니다.
        const uploadPath = path.join(__dirname, "pages", "uploads");
        if (!fs.existsSync(uploadPath)) {
            // 폴더가 없으면 생성 (운영 환경에서는 이 과정도 자동화되어야 함)
            try {
                fs.mkdirSync(uploadPath, { recursive: true });
            } catch (error) {
                console.error("Upload directory creation failed:", error);
            }
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // 파일명: 필드명-타임스탬프.확장자
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(
            null,
            file.fieldname +
                "-" +
                uniqueSuffix +
                path.extname(file.originalname)
        );
    },
});
const upload = multer({ storage: storage });


// 🔥 세션 미들웨어 (무조건 req.session 쓰는 것들보다 위에 있어야 함)
app.use(
    session({
        secret: "secret-key-strong", // 나중에 바꿔
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 2, // 2시간 유지
        },
    })
);
/* -------------------- 1. 공통 설정 -------------------- */

// 뷰 엔진 / 뷰 폴더
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "pages"));

// // 정적 파일, POST body 파싱
// app.use(express.static("pages"));
// app.use('/js', express.static(path.join(__dirname, 'js')));

app.use(express.json());

app.use(express.urlencoded({ extended: true }));
// 정적 파일, POST body 파싱
// app.use(express.static("pages"));
app.use(express.static(path.join(__dirname, "pages")));
app.use("/js", express.static(path.join(__dirname, "pages", "js")));

// 🔥 모든 ejs에서 user 쓸 수 있게 (세션 다음!)
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

// 로그인 체크 미들웨어
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }
    next();
}

/* -------------------- 2. 인증 관련 라우트 -------------------- */

// 로그인 페이지
app.get("/login", (req, res) => {
    res.render("login", {});
});

// 로그인 처리
app.post("/login", async (req, res) => {
    const { id, password } = req.body;

    // -------------------- 🔥 DB 쿼리 시작 --------------------
    try {
        // 1. ID로 사용자 찾기 (패스워드와 닉네임만 가져옵니다)
        const [users] = await db.query(
            "SELECT id, password, nickname FROM users WHERE id = ?",
            [id]
        );

        const user = users[0];
        if (!user) {
            return res.send("❌ 존재하지 않는 아이디입니다.");
        }

        // 2. 비밀번호 비교
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.send("❌ 비밀번호가 틀렸습니다.");
        }

        // 3. 세션 저장
        req.session.user = {
            id: user.id,
            nickname: user.nickname,
        };

        res.redirect("/main");
    } catch (error) {
        console.error("로그인 DB 오류:", error);
        res.status(500).send("로그인 중 서버 오류가 발생했습니다.");
    }
    // -------------------- 🔥 DB 쿼리 끝 --------------------
});

// 회원가입 페이지
app.get("/signup", (req, res) => {
    res.render("signup", {});
});

// 회원가입 처리
app.post("/signup", async (req, res) => {
    const { id, email, password, nickname } = req.body;
    // -------------------- 🔥 DB 쿼리 시작 --------------------
    try {
        // 1. ID 중복 확인
        const [existingUsers] = await db.query(
            "SELECT id FROM users WHERE id = ? OR email = ? OR nickname = ?",
            [id, email, nickname]
        );
        if (existingUsers.length > 0) {
            const exists = existingUsers[0];
            if (exists.id === id) {
                return res.status(400).send("이미 사용중인 아이디입니다.");
            } else if (exists.email === email) {
                return res.status(400).send("이미 사용중인 이메일입니다.");
            } else if (exists.nickname === nickname) {
                return res.status(400).send("이미 사용중인 닉네임입니다.");
            }
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        // 2. 새 사용자 DB에 삽입
        await db.query(
            "INSERT INTO users (id, email, password, nickname) VALUES (?, ?, ?, ?)",
            [id, email, hashedPassword, nickname]
        );
        res.send("회원가입 성공!");
    } catch (error) {
        console.error("회원가입 DB 오류:", error);
        res.status(500).send("회원가입 중 서버 오류가 발생했습니다.");
    }
    // -------------------- 🔥 DB 쿼리 끝 --------------------
});

// 로그아웃
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/main");
    });
});

/* -------------------- 3. 메인 / 리스트 페이지 -------------------- */

// 메인 페이지
// 메인 페이지
app.get("/main", async (req, res) => {
    // -------------------- 🔥 DB 쿼리 시작 --------------------
    try {
        // 1. 좋아요 수(likes)를 기준으로 내림차순 정렬하여 모든 소설을 가져옵니다.
        const [novels] = await db.query(
            "SELECT * FROM novels ORDER BY likes DESC"
        );

        // 2. 소설들을 연재 상태별로 필터링합니다. (DB에서 직접 WHERE 절로 가져오는 것도 가능)
        const ongoingNovels = novels.filter(
            (n) => n.status === "연재중" || n.status === "연재 중"
        );
        const completedNovels = novels.filter((n) => n.status === "완결");

        res.render("index", {
            novels, // 정렬된 전체 소설
            ongoingNovels,
            completedNovels,
        });
    } catch (error) {
        console.error("메인 페이지 DB 오류:", error);
        res.status(500).send("메인 페이지 로딩 중 서버 오류가 발생했습니다.");
    }
    // -------------------- 🔥 DB 쿼리 끝 --------------------
});

// 전체 소설 리스트
app.get("/allnovel", async (req, res) => {
    try {
        const [storednovels] = await db.query("SELECT * FROM novels");

        res.render("allnovel", { novels: storednovels });
    } catch (error) {
        console.error("전체 소설 리스트 DB 오류:", error);
        res.status(500).send("소설 리스트 로딩 중 서버 오류가 발생했습니다.");
    }
});

// 완결작 리스트
app.get("/complete", async (req, res) => {
    try {
        const [completedNovels] = await db.query(
            "SELECT * FROM novels WHERE status = '완결'"
        );

        res.render("complete", { completedNovels });
    } catch (error) {
        console.error("완결작 리스트 DB 오류:", error);
        res.status(500).send("완결작 리스트 로딩 중 서버 오류가 발생했습니다.");
    }
});

// 연재중 리스트
app.get("/live", async (req, res) => {
    try {
        const [ongoingNovels] = await db.query(
            "SELECT * FROM novels WHERE status = '연재중' OR status = '연재 중'"
        );

        res.render("live", { novels: ongoingNovels });
    } catch (error) {
        console.error("연재중 리스트 DB 오류:", error);
        res.status(500).send("연재중 리스트 로딩 중 서버 오류가 발생했습니다.");
    }
});

// 내 작품 페이지 (로그인 필요)
app.get("/mynovel", requireLogin, async (req, res) => {
    const loginUserId = req.session.user.id;

    try {
        // 로그인한 사용자의 ID로 소설들을 필터링합니다.
        const [myNovels] = await db.query(
            "SELECT * FROM novels WHERE userId = ?",
            [loginUserId]
        );

        res.render("mynovel", { user: req.session.user, novels: myNovels });
    } catch (error) {
        console.error("내 작품 페이지 DB 오류:", error);
        res.status(500).send("내 작품 로딩 중 서버 오류가 발생했습니다.");
    }
});

app.get("/writer/:userId", async (req, res) => { // ⭐ async 추가
    const userId = req.params.userId;

    try {
        // 1. 해당 작가의 모든 작품 조회 (닉네임도 같이 가져와서 작가 정보로 사용)
        const [writerNovels] = await db.query(
            "SELECT novels.*, users.nickname FROM novels JOIN users ON novels.userId = users.id WHERE novels.userId = ?",
            [userId]
        );

        if (writerNovels.length === 0) {
            // 작가 닉네임을 찾기 위해 users 테이블에서 한 번 더 조회
            const [userRow] = await db.query("SELECT nickname FROM users WHERE id = ?", [userId]);
            if (userRow.length === 0) {
                return res.status(404).send("해당 작가를 찾을 수 없습니다.");
            }
            // 작가는 존재하지만 작품이 없는 경우
            const writer = { nickname: userRow[0].nickname, bio: null };
            return res.render("writer", { writer, writerNovels: [] });
        }

        // 2. 작가 정보 (첫 번째 작품 또는 users 테이블에서 가져옴)
        const writer = {
            nickname: writerNovels[0].nickname,
            bio: null, // DB에 bio 컬럼이 없으므로 null 처리
        };

        res.render("writer", {
            writer,
            writerNovels,
        });

    } catch (error) {
        console.error("작가 페이지 DB 오류:", error);
        res.status(500).send("작가 페이지 로딩 중 서버 오류가 발생했습니다.");
    }
});

// app.get("/editnovel", (req, res) => {
//     res.render("editnovel", {});
// });

app.get("/editnovel", requireLogin, async (req, res) => {
    const novelId = req.query.novel;
    const currentUserId = req.session.user.id;

    try {
        // 1. novelId로 소설 조회
        const [novels] = await db.query(
            "SELECT * FROM novels WHERE novelId = ?",
            [novelId]
        );

        const novel = novels[0];

        if (!novel) {
            return res.status(404).send("해당 작품을 찾을 수 없습니다.");
        }

        // 2. 작품 소유자 확인
        if (novel.userId !== currentUserId) {
            return res.status(403).send("수정 권한이 없습니다.");
        }

        res.render("editnovel", { novel });
    } catch (error) {
        console.error("작품 수정 페이지 로드 DB 오류:", error);
        res.status(500).send("작품 정보 로딩 중 서버 오류가 발생했습니다.");
    }
});

// ... (multer, requireLogin 등 다른 미들웨어는 여기에 있다고 가정)

app.post(
    "/editnovel/:novelId",
    requireLogin,
    upload.single("coverImage"),
    async (req, res) => {
        // ⭐ async 추가
        const novelId = req.params.novelId;
        const { title, description, status, genre } = req.body;
        const currentUserId = req.session.user.id;

        const UPLOADS_DIR = path.join(__dirname, "pages", "uploads");

        try {
            // 1. 현재 소설 정보 조회
            const [existingNovels] = await db.query(
                "SELECT userId, coverImageUrl FROM novels WHERE novelId = ?",
                [novelId]
            );

            const currentNovel = existingNovels[0];

            if (!currentNovel) {
                // 작품을 찾지 못했을 경우, 업로드된 파일이 있다면 삭제
                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(404).send("해당 작품을 찾을 수 없습니다.");
            }

            // 2. 로그인한 유저가 이 작품의 소유자인지 체크
            if (currentNovel.userId !== currentUserId) {
                // 권한이 없으므로 새로 업로드된 파일도 삭제
                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(403).send("수정 권한이 없습니다.");
            }

            // 3. 이미지 파일 처리 로직 (파일 시스템 로직 유지)
            let newCoverImageUrl = currentNovel.coverImageUrl;

            if (req.file) {
                // 기존 이미지 삭제 시도
                if (
                    currentNovel.coverImageUrl &&
                    !currentNovel.coverImageUrl.includes("placehold.co")
                ) {
                    const oldFileName = path.basename(
                        currentNovel.coverImageUrl
                    );
                    const oldFilePath = path.join(UPLOADS_DIR, oldFileName);
                    if (fs.existsSync(oldFilePath)) {
                        fs.unlink(oldFilePath, (err) => {
                            if (err)
                                console.error(
                                    `기존 이미지 삭제 실패: ${oldFilePath}`,
                                    err
                                );
                        });
                    }
                }
                // 새 파일 경로 설정
                newCoverImageUrl = `/uploads/${req.file.filename}`;
            }

            // 4. DB 데이터 수정 (UPDATE 쿼리 실행)
            await db.query(
                `UPDATE novels 
                SET title = ?, description = ?, status = ?, genre = ?, coverImageUrl = ? 
                WHERE novelId = ?`,
                [title, description, status, genre, newCoverImageUrl, novelId]
            );

            res.redirect("/mynovel");
        } catch (error) {
            console.error("작품 수정 중 오류 발생:", error);
            // 오류 발생 시, 새로 업로드된 파일이 있다면 삭제 처리
            if (req.file) {
                try {
                    fs.unlinkSync(req.file.path);
                } catch (unlinkError) {
                    console.error("오류 발생 후 파일 정리 실패:", unlinkError);
                }
            }
            res.status(500).send("작품 수정 중 서버 오류가 발생했습니다.");
        }
    }
);

app.get("/addnovel", requireLogin, (req, res) => {
    res.render("addnovel");
});

app.post(
    "/addnovel",
    requireLogin,
    upload.single("novelCover"),
    async (req, res) => {
        // req.file 객체와 req.session.user는 Multer와 requireLogin 미들웨어를 통해 접근 가능합니다.
        const { title, description, genre } = req.body;

        // 커버 이미지 경로 설정 (DB에 저장할 URL 형식)
        const coverImageUrl = req.file
            ? `/uploads/${req.file.filename}`
            : "https://placehold.co/160x220/e5e5e5/777?text=NO+IMAGE";

        const newNovelId = uuid.v4(); // 새 소설의 고유 ID 생성
        const currentUserId = req.session.user.id;
        const currentUserNickname = req.session.user.nickname;

        try {
            // 1. 소설 정보를 novels 테이블에 삽입
            await db.query(
                `INSERT INTO novels 
            (novelId, title, description, genre, userId, nickname, status, likes, coverImageUrl) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
                [
                    newNovelId,
                    title,
                    description,
                    genre,
                    currentUserId,
                    currentUserNickname,
                    "연재중", // 기본 상태
                    coverImageUrl,
                ]
            );

            // 2. 작성 후 내 작품 페이지로 이동
            res.redirect("/mynovel");
        } catch (error) {
            console.error("작품 등록 DB 오류:", error);
            // 오류 발생 시, 새로 업로드된 파일이 있다면 삭제 처리
            if (req.file) {
                try {
                    fs.unlinkSync(req.file.path);
                } catch (unlinkError) {
                    console.error("오류 발생 후 파일 정리 실패:", unlinkError);
                }
            }
            res.status(500).send("작품 등록 중 서버 오류가 발생했습니다.");
        }
    }
);

app.post("/deletenovel", requireLogin, async (req, res) => {
    // ⭐ async 추가
    const { novelId } = req.body;
    const currentUserId = req.session.user.id;

    // 작품 삭제 전, 연결된 파일 삭제를 위한 정보 조회
    const [novelRows] = await db.query(
        "SELECT userId, coverImageUrl FROM novels WHERE novelId = ?",
        [novelId]
    );

    const novelToDelete = novelRows[0];

    if (!novelToDelete) {
        return res.status(404).send("삭제할 작품을 찾을 수 없습니다.");
    }

    // 소유권 확인
    if (novelToDelete.userId !== currentUserId) {
        return res.status(403).send("❌ 삭제 권한이 없습니다.");
    }

    try {
        // 1. 파일 시스템에서 이미지 삭제 (기존 로직 유지)
        if (
            novelToDelete.coverImageUrl &&
            !novelToDelete.coverImageUrl.includes("placehold.co")
        ) {
            const oldFileName = path.basename(novelToDelete.coverImageUrl);
            const oldFilePath = path.join(
                __dirname,
                "pages",
                "uploads",
                oldFileName
            );
            if (fs.existsSync(oldFilePath)) {
                fs.unlink(oldFilePath, (err) => {
                    if (err)
                        console.error(
                            "삭제할 이미지 파일 삭제 실패:",
                            oldFilePath,
                            err
                        );
                });
            }
        }

        // 2. DB에서 연결된 데이터 삭제 (외래키 제약 조건을 고려하여 순서대로)
        // A. 좋아요 삭제 (likes 테이블)
        await db.query("DELETE FROM likes WHERE novelId = ?", [novelId]);
        // B. 댓글 삭제 (comments 테이블)
        await db.query("DELETE FROM comments WHERE novelId = ?", [novelId]);
        // C. 회차 삭제 (episodes 테이블)
        await db.query("DELETE FROM episodes WHERE novelId = ?", [novelId]);
        // D. 소설 삭제 (novels 테이블)
        await db.query("DELETE FROM novels WHERE novelId = ?", [novelId]);

        res.redirect("/mynovel");
    } catch (error) {
        console.error("작품 삭제 DB 오류:", error);
        res.status(500).send("작품 삭제 중 서버 오류가 발생했습니다.");
    }
});

app.get(
    "/editepisode/:novelId/episode/:episodeNumber",
    requireLogin,
    async (req, res) => {
        // ⭐ async 추가
        const { novelId, episodeNumber } = req.params;
        const currentUserId = req.session.user.id;

        try {
            // 1. 소설 정보 및 소유자 조회
            const [novelRows] = await db.query(
                "SELECT userId, title FROM novels WHERE novelId = ?",
                [novelId]
            );
            const novel = novelRows[0];

            if (!novel) {
                return res.status(404).send("소설을 찾을 수 없습니다.");
            }

            // 2. 작품 소유자 확인 (권한 체크)
            if (novel.userId !== currentUserId) {
                return res.status(403).send("수정 권한이 없습니다.");
            }

            // 3. 에피소드 정보 조회
            // episodeNumber는 INT 타입이므로, 파라미터로 받은 문자열을 숫자로 변환할 필요 없이 DB에서 조회 가능
            const [episodeRows] = await db.query(
                "SELECT * FROM episodes WHERE novelId = ? AND episodeNumber = ?",
                [novelId, episodeNumber]
            );

            const episode = episodeRows[0];

            if (!episode) {
                return res.status(404).send("에피소드를 찾을 수 없습니다.");
            }

            // editepisode.ejs 렌더링
            res.render("editepisode", {
                novelId: novelId,
                novelTitle: novel.title,
                episode: episode,
                session: req.session,
            });
        } catch (error) {
            console.error("회차 수정 페이지 로드 DB 오류:", error);
            res.status(500).send("에피소드 정보 로딩 중 오류가 발생했습니다.");
        }
    }
);

app.post(
    "/editepisode/:novelId/episode/:episodeNumber",
    requireLogin,
    async (req, res) => {
        // ⭐ async 추가
        const { novelId, episodeNumber } = req.params;
        const { title, content } = req.body;
        const currentUserId = req.session.user.id;

        try {
            // 1. 소설 정보 및 소유자 조회 (권한 체크를 위해)
            const [novelRows] = await db.query(
                "SELECT userId FROM novels WHERE novelId = ?",
                [novelId]
            );
            const novel = novelRows[0];

            if (!novel) {
                return res.status(404).send("소설을 찾을 수 없습니다.");
            }

            // 2. 작품 소유자 확인
            if (novel.userId !== currentUserId) {
                return res.status(403).send("수정 권한이 없습니다.");
            }

            // 3. 에피소드 데이터 수정 (UPDATE 쿼리 실행)
            const timestamp = new Date()
                .toISOString()
                .slice(0, 19)
                .replace("T", " ");

            const [result] = await db.query(
                `UPDATE episodes 
                SET episodeTitle = ?, content = ?, updatedAt = ? 
                WHERE novelId = ? AND episodeNumber = ?`,
                [title, content, timestamp, novelId, episodeNumber]
            );

            if (result.affectedRows === 0) {
                return res
                    .status(404)
                    .send("수정할 에피소드를 찾을 수 없습니다.");
            }

            // 4. 성공 시 해당 작품 페이지로 리다이렉트
            res.redirect(`/novel/${novelId}`);
        } catch (error) {
            console.error("회차 수정 DB 오류:", error);
            res.status(500).send("에피소드 수정 중 서버 오류가 발생했습니다.");
        }
    }
);

app.get("/comment", (req, res) => {
    res.render("comment", {});
});

app.get("/comment1", (req, res) => {
    res.render("comment copy", {});
});

app.get("/comment2", (req, res) => {
    res.render("comment copy2", {});
});

app.get("/addepisode", requireLogin, (req, res) => {
    const novelId = req.query.novel;

    if (!novelId) {
        return res.status(400).send("novelId가 전달되지 않았습니다.");
    }

    res.render("addepisode", { novelId });
});

app.post("/addepisode", requireLogin, async (req, res) => {
    // ⭐ async 추가
    const { episodeTitle, content } = req.body;
    const novelId = req.query.novel; // URL에서 novelId 받음

    if (!novelId) {
        return res.status(400).send("novelId가 전달되지 않았습니다.");
    }

    try {
        // 1. 해당 소설의 최대 회차 번호를 조회하여 다음 회차 번호를 계산
        const [maxEpisodeRows] = await db.query(
            "SELECT MAX(episodeNumber) AS maxNumber FROM episodes WHERE novelId = ?",
            [novelId]
        );

        // 최대 회차 번호가 NULL (즉, 첫 회차)이면 1, 아니면 기존 최대값 + 1
        const maxNumber = maxEpisodeRows[0].maxNumber;
        const nextEpisodeNumber = maxNumber === null ? 1 : maxNumber + 1;

        // 2. 작품 소유자 확인 (추가적인 안정성 확보)
        const [novelRows] = await db.query(
            "SELECT userId FROM novels WHERE novelId = ?",
            [novelId]
        );
        const novel = novelRows[0];

        if (!novel || novel.userId !== req.session.user.id) {
            return res.status(403).send("회차 등록 권한이 없습니다.");
        }

        // 3. 타임스탬프 생성
        const timestamp = new Date()
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");

        const newEpisodeId = uuid.v4();

        // 4. 새 회차를 episodes 테이블에 삽입
        await db.query(
            `INSERT INTO episodes 
            (id, novelId, episodeNumber, episodeTitle, content, createdAt, updatedAt) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                newEpisodeId,
                novelId,
                nextEpisodeNumber,
                episodeTitle.trim(),
                content.trim(),
                timestamp,
                null, // 새 회차는 updatedAt에 NULL을 저장합니다. (테이블 정의에 따름)
            ]
        );

        // 작성 후 해당 소설의 작품 홈으로 이동
        res.redirect(`/novel/${novelId}`);
    } catch (error) {
        console.error("회차 등록 DB 오류:", error);
        res.status(500).send("회차 등록 중 서버 오류가 발생했습니다.");
    }
});

/* -------------------- 4. 소설 / 회차 / 댓글 관련 라우트 -------------------- */

app.get("/novel/:novelId", async (req, res) => {
    // ⭐ async 추가
    const novelId = req.params.novelId;

    try {
        // 1. 소설 정보 조회
        const [novelRows] = await db.query(
            "SELECT * FROM novels WHERE novelId = ?",
            [novelId]
        );
        const novel = novelRows[0];

        if (!novel) {
            return res.status(404).send("해당 소설을 찾을 수 없습니다.");
        }

        // 2. 해당 소설의 회차 목록 조회 (episodeNumber 오름차순 정렬)
        const [novelEpisodes] = await db.query(
            "SELECT * FROM episodes WHERE novelId = ? ORDER BY episodeNumber ASC",
            [novelId]
        );

        // 3. 작성자 권한 확인
        let isAuthor = false;
        if (req.session.user && novel.userId === req.session.user.id) {
            isAuthor = true;
        }

        // 4. EJS 렌더링
        res.render("novel", {
            novel,
            episodes: novelEpisodes,
            isAuthor: isAuthor,
            user: req.session.user || null,
        });
    } catch (error) {
        console.error("소설 상세 페이지 DB 오류:", error);
        res.status(500).send("소설 정보 로딩 중 서버 오류가 발생했습니다.");
    }
});

app.get("/novel/:novelId/:episodeNumber", async (req, res) => {
    // ⭐ async 추가
    const { novelId } = req.params;
    const episodeNumber = Number(req.params.episodeNumber);

    try {
        // 1. 작품 정보 조회
        const [novelRows] = await db.query(
            "SELECT * FROM novels WHERE novelId = ?",
            [novelId]
        );
        const novel = novelRows[0];
        if (!novel) {
            return res.status(404).send("해당 소설을 찾을 수 없습니다.");
        }

        // 2. 현재 회차 정보 조회
        const [episodeRows] = await db.query(
            "SELECT * FROM episodes WHERE novelId = ? AND episodeNumber = ?",
            [novelId, episodeNumber]
        );
        const episode = episodeRows[0];
        if (!episode) {
            return res.status(404).send("해당 회차를 찾을 수 없습니다.");
        }

        // 3. 총 회차 개수 계산
        const [countRows] = await db.query(
            "SELECT COUNT(*) AS totalEpisodes FROM episodes WHERE novelId = ?",
            [novelId]
        );
        const totalEpisodes = countRows[0].totalEpisodes;

        // 4. 이전화 / 다음화 계산
        const prev = episodeNumber > 1 ? episodeNumber - 1 : null;
        const next = episodeNumber < totalEpisodes ? episodeNumber + 1 : null;

        // EJS 렌더링
        res.render("episodes", {
            episode,
            novel,
            user: req.session.user,
            prev,
            next,
            total: totalEpisodes,
        });
    } catch (error) {
        console.error("회차 읽기 DB 오류:", error);
        res.status(500).send("회차 로딩 중 서버 오류가 발생했습니다.");
    }
});

app.get("/search", async (req, res) => {
    // ⭐ async 추가
    const q = req.query.q?.trim();
    if (!q) return res.redirect("/main");

    // DB에서 검색 문자열을 포함하는 소설을 찾기 위해 %q% 패턴 사용
    const searchTerm = `%${q}%`;

    try {
        // 🔍 제목, 닉네임, 설명(description) 중 하나라도 검색어를 포함하는 소설 조회
        const [result] = await db.query(
            `SELECT * FROM novels 
            WHERE title LIKE ? OR nickname LIKE ? OR description LIKE ?`,
            [searchTerm, searchTerm, searchTerm]
        );

        res.render("search", { q, result });
    } catch (error) {
        console.error("검색 DB 오류:", error);
        res.status(500).send("검색 중 서버 오류가 발생했습니다.");
    }
});

// 댓글 목록 + 입력 페이지
// 댓글 목록 + 입력 페이지
app.get("/novel/:novelId/:episodeNumber/comments", async (req, res) => { // ⭐ async 추가
    const { novelId } = req.params;
    const episodeNumber = Number(req.params.episodeNumber);

    try {
        // 1. 소설 정보 조회
        const [novelRows] = await db.query(
            "SELECT * FROM novels WHERE novelId = ?",
            [novelId]
        );
        const novel = novelRows[0];
        if (!novel) return res.status(404).send("해당 소설을 찾을 수 없습니다.");

        // 2. 회차 정보 조회
        const [episodeRows] = await db.query(
            "SELECT * FROM episodes WHERE novelId = ? AND episodeNumber = ?",
            [novelId, episodeNumber]
        );
        const episode = episodeRows[0];
        if (!episode) return res.status(404).send("해당 회차를 찾을 수 없습니다.");

        // 3. 해당 회차 댓글 조회 (작성 시간 순 오름차순)
        const [episodeComments] = await db.query(
            `SELECT * FROM comments 
            WHERE novelId = ? AND episodeNumber = ? 
            ORDER BY createdAt ASC`,
            [novelId, episodeNumber]
        );

        res.render("comments", {
            episode,
            novel,
            comments: episodeComments,
            user: req.session.user,
        });

    } catch (error) {
        console.error("댓글 목록 DB 오류:", error);
        res.status(500).send("댓글 목록 로딩 중 서버 오류가 발생했습니다.");
    }
});
///////////좋아요 코드

app.post("/like", requireLogin, async (req, res) => { // ⭐ async 추가
    const { novelId } = req.body;
    const currentUserId = req.session.user.id;
    
    // 트랜잭션 시작 (좋아요 추가/삭제 및 카운트 업데이트를 안전하게 처리)
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. 현재 좋아요 상태 확인
        const [likeRows] = await connection.query(
            "SELECT * FROM likes WHERE novelId = ? AND userId = ?",
            [novelId, currentUserId]
        );

        let likedStatus = false;
        let newLikesCount = 0;

        if (likeRows.length > 0) {
            // 좋아요 취소 (DELETE)
            await connection.query(
                "DELETE FROM likes WHERE novelId = ? AND userId = ?",
                [novelId, currentUserId]
            );
            // 소설 좋아요 카운트 감소 (UPDATE)
            await connection.query(
                "UPDATE novels SET likes = likes - 1 WHERE novelId = ?",
                [novelId]
            );
            likedStatus = false;
        } else {
            // 좋아요 추가 (INSERT)
            await connection.query(
                "INSERT INTO likes (novelId, userId) VALUES (?, ?)",
                [novelId, currentUserId]
            );
            // 소설 좋아요 카운트 증가 (UPDATE)
            await connection.query(
                "UPDATE novels SET likes = likes + 1 WHERE novelId = ?",
                [novelId]
            );
            likedStatus = true;
        }

        // 2. 변경된 좋아요 카운트 다시 조회
        const [novelUpdateRows] = await connection.query(
            "SELECT likes FROM novels WHERE novelId = ?",
            [novelId]
        );
        newLikesCount = novelUpdateRows[0].likes;

        await connection.commit();
        
        // 최종 결과 전송
        res.json({ liked: likedStatus, likes: newLikesCount });

    } catch (error) {
        await connection.rollback();
        console.error("좋아요 DB 오류:", error);
        res.status(500).json({ error: "좋아요 처리 중 서버 오류 발생" });

    } finally {
        connection.release();
    }
});

// 댓글 작성
// 댓글 작성
app.post("/novel/:novelId/:episodeNumber/comment", requireLogin, async (req, res) => { // ⭐ async 추가
    const { novelId } = req.params;
    const episodeNumber = Number(req.params.episodeNumber);
    const { content } = req.body;

    // 댓글 테이블 정의에 맞게 현재 시간 포맷
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const newCommentId = uuid.v4();
    const currentUserId = req.session.user.id;
    const currentUserNickname = req.session.user.nickname;

    try {
        // 1. 댓글을 comments 테이블에 삽입
        await db.query(
            `INSERT INTO comments 
            (id, novelId, episodeNumber, userId, nickname, content, likes, parentId, createdAt) 
            VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
            [
                newCommentId,
                novelId,
                episodeNumber,
                currentUserId,
                currentUserNickname,
                content.trim(),
                timestamp,
            ]
        );

        res.redirect(`/novel/${novelId}/${episodeNumber}/comments#comments`);
    } catch (error) {
        console.error("댓글 작성 DB 오류:", error);
        res.status(500).send("댓글 작성 중 서버 오류가 발생했습니다.");
    }
});

/* -------------------- 5. 서버 실행 -------------------- */

app.listen(3000);
