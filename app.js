

const path = require("path");
const fs = require("fs");
const express = require("express");
const bcrypt = require("bcrypt");
const session = require("express-session");
const uuid = require("uuid");
const multer = require("multer"); // 1. Multer 추가////////////////////////////////////////////////////

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

const novelPath = path.join(__dirname, "data", "novels.json");
const episodePath = path.join(__dirname, "data", "episodes.json");

const readData = (filePath) => {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        return [];
    }
};

// 데이터를 쓰는 함수
const writeData = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("데이터 저장 실패:", error);
        throw new Error("데이터 저장 중 오류가 발생했습니다.");
    }
};


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
app.use("/js", express.static(path.join(__dirname, "pagea", "js")));



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

    const userPath = path.join(__dirname, "data", "users.json");
    const users = JSON.parse(fs.readFileSync(userPath, "utf8"));

    const user = users.find((u) => u.id === id);
    if (!user) {
        return res.send("❌ 존재하지 않는 아이디입니다.");
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
        return res.send("❌ 비밀번호가 틀렸습니다.");
    }

    // 세션 저장
    req.session.user = {
        id: user.id,
        nickname: user.nickname,
    };

    res.redirect("/main");
});

// 회원가입 페이지
app.get("/signup", (req, res) => {
    res.render("signup", {});
});

// 회원가입 처리
app.post("/signup", async (req, res) => {
    const { id, email, password, nickname } = req.body;

    const userPath = path.join(__dirname, "data", "users.json");
    const fileData = fs.readFileSync(userPath, "utf8");
    const users = JSON.parse(fileData);

    const exists = users.find((user) => user.id === id);
    if (exists) {
        return res.status(400).send("이미 사용중인 아이디입니다.");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
        id,
        email,
        password: hashedPassword,
        nickname,
    };

    users.push(newUser);
    fs.writeFileSync(userPath, JSON.stringify(users, null, 2));

    res.send("회원가입 성공!");
});



// 로그아웃
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/main");
    });
});

/* -------------------- 3. 메인 / 리스트 페이지 -------------------- */

// 메인 페이지
app.get("/main", (req, res) => {
    const novelPath = path.join(__dirname, "data", "novels.json");
    const novels = JSON.parse(fs.readFileSync(novelPath, "utf8"));

    const sortedNovels = [...novels].sort((a, b) => {
        const likesA = typeof a.likes === "number" ? a.likes : 0;
        const likesB = typeof b.likes === "number" ? b.likes : 0;
        return likesB - likesA;
    });

    const ongoingNovels = sortedNovels.filter((n) => n.status === "연재중");
    const completedNovels = sortedNovels.filter((n) => n.status === "완결");

    res.render("index", {
        novels: sortedNovels,
        ongoingNovels,
        completedNovels,
    });
});

// 전체 소설 리스트
app.get("/allnovel", (req, res) => {
    const filePath = path.join(__dirname, "data", "novels.json");
    const fileData = fs.readFileSync(filePath, "utf8");
    const storednovels = JSON.parse(fileData);

    res.render("allnovel", { novels: storednovels });
});

// 완결작 리스트
app.get("/complete", (req, res) => {
    const novelPath = path.join(__dirname, "data", "novels.json");
    const novels = JSON.parse(fs.readFileSync(novelPath, "utf8"));

    const completedNovels = novels.filter((n) => n.status === "완결");

    res.render("complete", { completedNovels });
});

// 연재중 리스트
app.get("/live", (req, res) => {
    const novelPath = path.join(__dirname, "data", "novels.json");
    const novels = JSON.parse(fs.readFileSync(novelPath, "utf8"));

    const ongoingNovels = novels.filter((n) => n.status === "연재중");

    res.render("live", { novels: ongoingNovels });
});

// 내 작품 페이지 (로그인 필요)
app.get("/mynovel", requireLogin, (req, res) => {
    const novelPath = path.join(__dirname, "data", "novels.json");
    const novels = JSON.parse(fs.readFileSync(novelPath, "utf8"));

    const loginUserId = req.session.user.id;
    const myNovels = novels.filter((novel) => novel.userId === loginUserId);

    res.render("mynovel", { user: req.session.user, novels: myNovels });
});



app.get("/writer/:userId", (req, res) => {
    const userId = req.params.userId;

    const novelPath = path.join(__dirname, "data", "novels.json");
    const novels = JSON.parse(fs.readFileSync(novelPath, "utf8"));

    // writerId에 해당하는 모든 작품 가져오기
    const writerNovels = novels.filter((n) => n.userId === userId);

    if (writerNovels.length === 0) {
        return res.status(404).send("해당 작가의 작품이 없습니다.");
    }

    // 작가 정보
    const writer = {
        nickname: writerNovels[0].nickname,
        bio: writerNovels[0].bio || null,
    };

    res.render("writer", {
        writer,
        writerNovels,
    });
});

// app.get("/editnovel", (req, res) => {
//     res.render("editnovel", {});
// });

app.get("/editnovel", requireLogin, (req, res) => {
    const novelId = req.query.novel;

    const novelPath = path.join(__dirname, "data", "novels.json");
    const novels = JSON.parse(fs.readFileSync(novelPath, "utf8"));

    const novel = novels.find((n) => n.novelId === novelId);

    if (!novel) {
        return res.status(404).send("해당 작품을 찾을 수 없습니다.");
    }

    res.render("editnovel", { novel });
});



// ... (multer, requireLogin 등 다른 미들웨어는 여기에 있다고 가정)

app.post(
    "/editnovel/:novelId",
    requireLogin,
    upload.single("coverImage"),
    (req, res) => {
        // novelId를 URL 파라미터에서 가져옵니다.
        const novelId = req.params.novelId;
        // ⭐ 장르(genre) 필드를 추가로 가져옵니다.
        const { title, description, status, genre } = req.body; 

        // 작품 데이터 파일 경로
        const novelPath = path.join(__dirname, "data", "novels.json");
        
        // ⭐ 핵심 수정: 이미지가 실제로 저장된 서버의 물리적 디렉토리 경로 정의
        // 폴더 구조 이미지에 따라, 업로드 경로는 'pages/uploads' 입니다.
        const UPLOADS_DIR = path.join(__dirname, "pages", "uploads"); 

        try {
            const novels = JSON.parse(fs.readFileSync(novelPath, "utf8"));
            const index = novels.findIndex((n) => n.novelId === novelId);

            if (index === -1) {
                // 작품을 찾지 못했을 경우, 업로드된 파일이 있다면 삭제 (Multer가 저장한 파일)
                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(404).send("해당 작품을 찾을 수 없습니다.");
            }

            const currentNovel = novels[index];

            // 로그인한 유저가 이 작품의 소유자인지 체크
            if (currentNovel.userId !== req.session.user.id) {
                // 권한이 없으므로 새로 업로드된 파일도 삭제해야 함
                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(403).send("수정 권한이 없습니다.");
            }

            // 1. 이미지 파일 처리 로직
            if (req.file) {
                // 새 이미지가 업로드된 경우: 기존 이미지 파일 삭제 시도
                if (
                    currentNovel.coverImageUrl &&
                    !currentNovel.coverImageUrl.includes("placehold.co")
                ) {
                    // novels.json에 저장된 URL 경로에서 파일 이름만 추출
                    // 예: "/uploads/image.jpg" -> "image.jpg"
                    const oldFileName = path.basename(currentNovel.coverImageUrl);
                    
                    // ⭐ 수정된 경로: 실제 물리적 업로드 디렉토리(pages/uploads)를 기준으로 파일 경로 생성
                    const oldFilePath = path.join(UPLOADS_DIR, oldFileName); 

                    if (fs.existsSync(oldFilePath)) {
                        // 기존 파일 삭제
                        fs.unlink(oldFilePath, (err) => {
                            if (err)
                                console.error(
                                    `기존 이미지 삭제 실패: ${oldFilePath}`,
                                    err
                                );
                        });
                    }
                }
                // 새 파일 경로를 novels.json에 저장할 URL 형식으로 업데이트
                // req.file.filename은 Multer가 저장한 파일 이름입니다. (Multer 설정에 따라 이미 'pages/uploads'에 저장되었을 것입니다)
                currentNovel.coverImageUrl = `/uploads/${req.file.filename}`;
            }

            // 2. 데이터 수정 (제목, 설명, 상태, 장르)
            currentNovel.title = title;
            currentNovel.description = description;
            currentNovel.status = status;
            currentNovel.genre = genre; // ⭐ 장르 업데이트

            // 파일에 변경된 내용 저장
            fs.writeFileSync(novelPath, JSON.stringify(novels, null, 2));

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



app.post("/addnovel", requireLogin, upload.single("novelCover"), (req, res) => {
    // 1. req.body에서 title, description, 그리고 새로 추가할 genre를 가져옵니다.
    const { title, description, genre } = req.body; 

    const novelPath = path.join(__dirname, "data", "novels.json");
    const novels = JSON.parse(fs.readFileSync(novelPath, "utf8")); 

    // 커버 이미지 경로 설정
    const coverImageUrl = req.file
        ? `/uploads/${req.file.filename}`
        : "https://placehold.co/160x220/e5e5e5/777?text=NO+IMAGE"; 

    const newNovel = {
        id: uuid.v4(),
        novelId: uuid.v4(),
        title,
        description,
        // 2. 장르(genre) 필드를 새 소설 객체에 추가합니다.
        genre, 
        nickname: req.session.user.nickname,
        userId: req.session.user.id,
        status: "연재중",
        likes: 0,
        coverImageUrl, 
    };

    novels.push(newNovel);

    fs.writeFileSync(novelPath, JSON.stringify(novels, null, 2));

    res.redirect("/mynovel");
});



app.post("/deletenovel", requireLogin, (req, res) => {
    const { novelId } = req.body;

    const novelPath = path.join(__dirname, "data", "novels.json");
    let novels = JSON.parse(fs.readFileSync(novelPath, "utf8"));

    const index = novels.findIndex((n) => n.novelId === novelId);
    if (index === -1) {
        return res.status(404).send("삭제할 작품을 찾을 수 없습니다.");
    } // 🔥 소유권 확인

    if (novels[index].userId !== req.session.user.id) {
        return res.status(403).send("❌ 삭제 권한이 없습니다.");
    } // 🔥 [추가] 작품 삭제 전에 연결된 이미지 파일 삭제
    if (
        novels[index].coverImageUrl &&
        !novels[index].coverImageUrl.includes("placehold.co")
    ) {
        const oldFileName = path.basename(novels[index].coverImageUrl);
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
    } // 작품 삭제 (해당 인덱스 제거)

    novels.splice(index, 1); // 💡 참고: 실제 운영 환경에서는 이 작품에 속한 에피소드, 댓글, 좋아요 데이터도 모두 삭제해야 합니다.
    fs.writeFileSync(novelPath, JSON.stringify(novels, null, 2));

    res.redirect("/mynovel");
});

app.get(
    "/editepisode/:novelId/episode/:episodeNumber", // episodeNumber 기반으로 라우트 설정
    requireLogin,
    (req, res) => {
        // URL에서 novelId와 episodeNumber를 추출합니다.
        const { novelId, episodeNumber } = req.params;
        const novels = readData(novelPath);
        const episodes = readData(episodePath);

        const novel = novels.find((n) => n.novelId === novelId);
        
        // episodeNumber와 novelId가 모두 일치하는 에피소드를 찾습니다.
        // 참고: episodeNumber가 문자열 형태라고 가정하고 비교합니다.
        const episode = episodes.find((e) => e.episodeNumber == episodeNumber && e.novelId === novelId);

        if (!novel || !episode) {
            return res.status(404).send("소설 또는 에피소드를 찾을 수 없습니다.");
        }

        // 🔥 작품 소유자 확인 (권한 체크)
        if (novel.userId !== req.session.user.id) {
            return res.status(403).send("수정 권한이 없습니다.");
        }

        // editepisode.ejs 렌더링
        res.render("editepisode", { 
            novelId: novelId,
            novelTitle: novel.title, // EJS 페이지 제목에 사용
            episode: episode, // 찾은 에피소드 데이터 전체 전달
            session: req.session 
        });
    }
);

app.post(
    "/editepisode/:novelId/episode/:episodeNumber", 
    requireLogin,
    (req, res) => {
        const { novelId, episodeNumber } = req.params;
        
        // 폼에서 전송된 새로운 제목과 내용
        const { title, content } = req.body; 
        
        const novels = readData(novelPath);
        const episodes = readData(episodePath);

        const novel = novels.find((n) => n.novelId === novelId);
        // episodeNumber와 novelId가 모두 일치하는 에피소드를 찾아 인덱스를 확인합니다.
        const index = episodes.findIndex((e) => e.episodeNumber == episodeNumber && e.novelId === novelId);

        if (!novel || index === -1) {
            return res.status(404).send("소설 또는 에피소드를 찾을 수 없습니다.");
        }

        const currentEpisode = episodes[index];

        // 작품 소유자 확인
        if (novel.userId !== req.session.user.id) {
            return res.status(403).send("수정 권한이 없습니다.");
        }

        // 3. 에피소드 데이터 수정
        currentEpisode.episodeTitle = title; 
        currentEpisode.content = content;
        // ✅ 수정됨: 에피소드가 실제로 수정되었으므로, updatedAt을 최신 시간으로 업데이트합니다.
        currentEpisode.updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
        
        // 4. 파일에 저장
        try {
            fs.writeFileSync(episodePath, JSON.stringify(episodes, null, 2));
        } catch (error) {
            console.error("에피소드 데이터 저장 실패:", error);
            return res.status(500).send("에피소드 수정 중 오류가 발생했습니다.");
        }

        // 5. 성공 시 해당 작품 페이지로 리다이렉트
        res.redirect(`/novel/${novelId}`);
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

app.post("/addepisode", requireLogin, (req, res) => {
    const { episodeTitle, content } = req.body;
    const novelId = req.query.novel; // URL에서 novelId 받음

    if (!novelId) {
        return res.status(400).send("novelId가 전달되지 않았습니다.");
    }

    const episodePath = path.join(__dirname, "data", "episodes.json");
    const episodes = JSON.parse(fs.readFileSync(episodePath, "utf8"));

    // 해당 소설의 기존 회차 숫자 계산 → 다음 회차 번호 자동 생성
    const novelEpisodes = episodes.filter((ep) => ep.novelId === novelId);
    const nextEpisodeNumber = novelEpisodes.length + 1;

    // 타임스탬프를 한 번만 생성하여 createdAt과 updatedAt에 사용
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const newEpisode = {
        id: uuid.v4(),
        novelId,
        episodeNumber: nextEpisodeNumber,
        episodeTitle: episodeTitle.trim(),
        content: content.trim(),
        createdAt: timestamp, // 생성 시간 기록
        updatedAt: timestamp, // ✅ 추가: 수정 시간 초기화 (생성 시간과 동일)
    };

    episodes.push(newEpisode);

    fs.writeFileSync(episodePath, JSON.stringify(episodes, null, 2));

    // 작성 후 해당 소설의 작품 홈으로 이동
    res.redirect(`/novel/${novelId}`);
});

/* -------------------- 4. 소설 / 회차 / 댓글 관련 라우트 -------------------- */



app.get("/novel/:novelId", (req, res) => {
    const novelId = req.params.novelId;

    // JSON 파일을 DB처럼 관리
    const novelPath = path.join(__dirname, "data", "novels.json");
    const episodePath = path.join(__dirname, "data", "episodes.json");

    const novels = JSON.parse(fs.readFileSync(novelPath, "utf8"));
    const episodes = JSON.parse(fs.readFileSync(episodePath, "utf8"));

    const novel = novels.find((n) => n.novelId === novelId);
    if (!novel) {
        return res.status(404).send("해당 소설을 찾을 수 없습니다.");
    }

    // 🔑 작성자 권한 확인 로직 추가
    let isAuthor = false;
    // req.session.user가 존재하고, 작품의 userId와 세션의 ID가 일치하는지 확인
    if (req.session.user && novel.userId === req.session.user.id) {
        isAuthor = true;
    }

    // 회차 필터링 및 정렬
    const novelEpisodes = episodes
        .filter((ep) => ep.novelId === novelId)
        .sort((a, b) => a.episodeNumber - b.episodeNumber);

    // EJS 렌더링 시 권한 플래그와 사용자 정보 전달
    res.render("novel", {
        novel,
        episodes: novelEpisodes,
        isAuthor: isAuthor, // <-- 이 플래그로 EJS에서 수정 버튼을 보이게 합니다.
        user: req.session.user || null,
    });
});



app.get("/novel/:novelId/:episodeNumber", (req, res) => {
    const { novelId } = req.params;
    const episodeNumber = Number(req.params.episodeNumber);

    const novelPath = path.join(__dirname, "data", "novels.json");
    const episodePath = path.join(__dirname, "data", "episodes.json");

    const novels = JSON.parse(fs.readFileSync(novelPath, "utf8"));
    const episodes = JSON.parse(fs.readFileSync(episodePath, "utf8"));

    // 현재 회차 찾기
    const episode = episodes.find(
        (ep) =>
            ep.novelId === novelId && Number(ep.episodeNumber) === episodeNumber
    );
    if (!episode) {
        return res.status(404).send("해당 회차를 찾을 수 없습니다.");
    }

    // 작품 정보 찾기
    const novel = novels.find((n) => n.novelId === novelId);
    if (!novel) {
        return res.status(404).send("해당 소설을 찾을 수 없습니다.");
    }

    // 🔥 총 회차 개수 계산
    const totalEpisodes = episodes.filter(
        (ep) => ep.novelId === novelId
    ).length;

    // 🔥 이전화 / 다음화 계산 (실무 스타일)
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
});

app.get("/search", (req, res) => {
    const q = req.query.q?.trim();
    if (!q) return res.redirect("/main");

    const novelPath = path.join(__dirname, "data", "novels.json");
    const novels = JSON.parse(fs.readFileSync(novelPath, "utf8"));

    // 🔍 검색 로직 (제목 + 필자닉네임 + 소개에서 포함 검색)
    const result = novels.filter(
        (n) =>
            n.title.includes(q) ||
            n.nickname.includes(q) ||
            (n.description && n.description.includes(q))
    );

    res.render("search", { q, result });
});

// 댓글 목록 + 입력 페이지
app.get("/novel/:novelId/:episodeNumber/comments", (req, res) => {
    const { novelId } = req.params;
    const episodeNumber = Number(req.params.episodeNumber);

    const novelPath = path.join(__dirname, "data", "novels.json");
    const episodePath = path.join(__dirname, "data", "episodes.json");
    const commentPath = path.join(__dirname, "data", "comments.json");

    const novels = JSON.parse(fs.readFileSync(novelPath, "utf8"));
    const episodes = JSON.parse(fs.readFileSync(episodePath, "utf8"));
    const commentsAll = JSON.parse(fs.readFileSync(commentPath, "utf8"));

    const episode = episodes.find(
        (ep) =>
            ep.novelId === novelId && Number(ep.episodeNumber) === episodeNumber
    );
    if (!episode) return res.status(404).send("해당 회차를 찾을 수 없습니다.");

    const novel = novels.find((n) => n.novelId === novelId);
    if (!novel) return res.status(404).send("해당 소설을 찾을 수 없습니다.");

    const episodeComments = commentsAll
        .filter(
            (c) =>
                c.novelId === novelId &&
                Number(c.episodeNumber) === episodeNumber
        )
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    res.render("comments", {
        episode,
        novel,
        comments: episodeComments,
        user: req.session.user,
    });
});

///////////좋아요 코드

app.post("/like", requireLogin, (req, res) => {
    const { novelId } = req.body;

    const likesPath = path.join(__dirname, "data", "likes.json");
    const novelsPath = path.join(__dirname, "data", "novels.json");

    const likes = JSON.parse(fs.readFileSync(likesPath, "utf8"));
    const novels = JSON.parse(fs.readFileSync(novelsPath, "utf8"));

    const key = `${novelId}_${req.session.user.id}`;

    // 🔥 좋아요 토글
    if (likes[key]) {
        // 좋아요 취소
        delete likes[key];

        const novel = novels.find((n) => n.novelId === novelId);
        if (novel) novel.likes = Math.max(0, novel.likes - 1);

        fs.writeFileSync(likesPath, JSON.stringify(likes, null, 2));
        fs.writeFileSync(novelsPath, JSON.stringify(novels, null, 2));

        return res.json({ liked: false, likes: novel.likes });
    } else {
        // 좋아요 추가
        likes[key] = true;

        const novel = novels.find((n) => n.novelId === novelId);
        if (novel) novel.likes += 1;

        fs.writeFileSync(likesPath, JSON.stringify(likes, null, 2));
        fs.writeFileSync(novelsPath, JSON.stringify(novels, null, 2));

        return res.json({ liked: true, likes: novel.likes });
    }
});

// 댓글 작성
app.post("/novel/:novelId/:episodeNumber/comment", requireLogin, (req, res) => {
    const { novelId } = req.params;
    const episodeNumber = Number(req.params.episodeNumber);
    const { content } = req.body;

    const commentPath = path.join(__dirname, "data", "comments.json");
    const allComments = JSON.parse(fs.readFileSync(commentPath, "utf8"));

    const newComment = {
        id: uuid.v4(),
        novelId,
        episodeNumber,
        userId: req.session.user.id,
        nickname: req.session.user.nickname,
        content: content.trim(),
        likes: 0,
        parentId: null,
        createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };

    allComments.push(newComment);
    fs.writeFileSync(commentPath, JSON.stringify(allComments, null, 2));

    res.redirect(`/novel/${novelId}/${episodeNumber}/comments#comments`);
});

/* -------------------- 5. 서버 실행 -------------------- */

app.listen(3000);
