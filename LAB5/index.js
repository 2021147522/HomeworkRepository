const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const port = 3000;

// 데이터베이스 연결
const dbPath = path.join(__dirname, "product.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    return console.error(err.message);
  }
  console.log("Connected to the SQLite database.");
});

// 정적 파일(CSS) 제공
app.use(express.static(path.join(__dirname, "public")));
// POST 요청 본문 파싱
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 영화 데이터 API 라우트
app.get("/api/movies", (req, res) => {
  const keyword = req.query.keyword || "";
  const category = req.query.category || "movie_title";

  let sql = `SELECT * FROM movies`;
  const params = [];

  if (keyword) {
    // 제목과 줄거리에서 동시에 검색
    sql += ` WHERE movie_title LIKE ? OR movie_overview LIKE ?`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  db.all(sql, params, (err, movies) => {
    if (err) {
      res.status(500).json({ error: "DB 조회 오류" });
      return;
    }

    // 클라이언트에서 기대하는 형식으로 데이터 변환
    const formattedMovies = movies.map((movie) => ({
      id: movie.movie_id,
      title: movie.movie_title,
      poster: movie.movie_image,
      overview: movie.movie_overview,
      vote_average: movie.movie_rate,
      genre: [], // 장르 정보가 DB에 없어서 빈 배열로 설정
    }));

    res.json(formattedMovies);
  });
});

// 클라이언트용 영화 목록 API
app.get("/movies", (req, res) => {
  const sql = `SELECT * FROM movies`;

  db.all(sql, [], (err, movies) => {
    if (err) {
      res.status(500).json({ error: "DB 조회 오류" });
      return;
    }

    // 클라이언트에서 기대하는 형식으로 데이터 변환
    const formattedMovies = movies.map((movie) => ({
      id: movie.movie_id,
      title: movie.movie_title,
      poster: movie.movie_image,
      overview: movie.movie_overview,
      vote_average: movie.movie_rate,
      genre: [], // 장르 정보가 DB에 없어서 빈 배열로 설정
    }));

    res.json(formattedMovies);
  });
});

// 영화 상세 페이지 라우트
app.get("/movies/:movie_id", (req, res) => {
  const movieId = req.params.movie_id;
  const sql = `SELECT * FROM movies WHERE movie_id = ?`;

  db.get(sql, [movieId], (err, movie) => {
    if (err || !movie) {
      res.status(404).send("영화를 찾을 수 없습니다.");
      return;
    }

    fs.readFile(path.join(__dirname, "comment.json"), "utf8", (err, data) => {
      const comments = err || !data ? {} : JSON.parse(data);
      const movieComments = comments[movieId] || [];

      const commentsHtml = movieComments
        .map(
          (c) => `
                <div class="comment-item">
                    <p><strong>${c.author}</strong> (${new Date(
            c.date
          ).toLocaleString()})</p>
                    <p>${c.content}</p>
                </div>
            `
        )
        .join("");

      const content = `
                <section class="movie-detail-section">
                    <div class="movie-detail-container">
                        <img src="${movie.movie_image}" alt="${
        movie.movie_title
      }" class="movie-detail-image">
                        <div class="movie-detail-info">
                            <h2>${movie.movie_title}</h2>
                            <p><strong>개봉일:</strong> ${new Date(
                              movie.movie_release_date
                            ).toLocaleDateString()}</p>
                            <p><strong>평점:</strong> ${movie.movie_rate}</p>
                            <p><strong>줄거리:</strong></p>
                            <p>${movie.movie_overview}</p>
                        </div>
                    </div>
                </section>
                <section class="comment-section">
                    <h3>후기</h3>
                    <div id="comment-list">${commentsHtml}</div>
                    <form id="comment-form" action="/movies/${movieId}/comment" method="POST">
                        <h4>후기 작성</h4>
                        <div class="form-group"><label for="author">작성자</label><input type="text" id="author" name="author" required></div>
                        <div class="form-group"><label for="content">내용</label><textarea id="content" name="content" rows="3" required></textarea></div>
                        <button type="submit">작성</button>
                    </form>
                </section>
            `;

      const html = `
            <!DOCTYPE html>
            <html lang="ko">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${movie.movie_title}</title>
                <link rel="stylesheet" href="/main.css">
            </head>
            <body>
                <div class="container">
                    <header>
                        <div class="header-animation">
                            <h1>인프밍 영화정보 사이트</h1>
                        </div>
                    </header>
                    <nav class="main-nav">
                        <div class="logo">인프밍 영화정보</div>
                        <ul class="nav-links">
                            <li><a href="/">메인</a></li>
                            <li><a href="/signup">회원가입</a></li>
                            <li><a href="/login">로그인</a></li>
                        </ul>
                    </nav>
                    <main>${content}</main>
                    <footer>
                        <p>&copy; 2025 인프밍 영화정보 사이트. All rights reserved.</p>
                    </footer>
                </div>
            </body>
            </html>`;
      res.send(html);
    });
  });
});

// 후기 추가 라우트
app.post("/movies/:movie_id/comment", (req, res) => {
  const movieId = req.params.movie_id;
  const { author, content } = req.body;
  const commentFilePath = path.join(__dirname, "comment.json");

  fs.readFile(commentFilePath, "utf8", (err, data) => {
    const comments = err || !data ? {} : JSON.parse(data);
    if (!comments[movieId]) {
      comments[movieId] = [];
    }
    comments[movieId].push({ author, content, date: new Date() });

    fs.writeFile(commentFilePath, JSON.stringify(comments, null, 2), (err) => {
      if (err) {
        res.status(500).send("후기 저장 실패");
        return;
      }
      res.redirect(`/movies/${movieId}`);
    });
  });
});

// 서버 시작
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
