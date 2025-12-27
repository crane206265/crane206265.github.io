function loadPage(page) {
    fetch(`/blog/pages/${page}`)
        .then(r => r.text())
        .then(html => {
          document.getElementById("content").innerHTML = html;

          // 페이지별 init
          if (page === "blogHome.html") renderRecentPosts();
        })
        .catch(console.error);
}

async function renderRecentPosts() {
    const mount = document.getElementById("recentPostList");
    if (!mount) return;

    const posts = await fetch("/blog/data/articles.json").then(r => r.json());
    posts.sort((a, b) => (b.articleNo ?? 0) - (a.articleNo ?? 0));

    mount.innerHTML = posts.map((p, idx) => `
        <a href="${p.page}" class="a-articleBlock1">
            <div class="articleBlock1">
                <img class="articleBlockImg1" src="${p.image}" alt="articleImage">
                <div class="articleBlockTitleCol1">
                    <span class="articleBlockTitle1"> ${p.title1}</span>
                    <span class="articleBlockTitle2"> ${p.title2}</span>
                </div>
                <div class="articleBlockContent1"></div>
                <div class="articleBlockDate">${p.date}</div>
                <div class="articleBlockNumbering">${p.articleNo}</div>
            </div>
        </a>
    `).join("");
}

async function renderPrevNextCards(n = 3, currentPath = window.location.pathname) {
    const prevMount = document.getElementById("postNavPrev");
    const nextMount = document.getElementById("postNavNext");
    if (!prevMount || !nextMount) return; // 글 페이지가 아니면 그냥 종료
    
    // posts.json 로드
    const posts = await fetch("/blog/data/articles.json").then(r => r.json());
    
    // articleNo 기준 정렬 (작은 번호 -> 큰 번호)
    posts.sort((a, b) => (a.articleNo ?? 0) - (b.articleNo ?? 0));

    // 현재 글 찾기: "파일명"으로 매칭 (경로 차이에도 강함)
    const currentFile = currentPath.split("/").pop();
    const idx = posts.findIndex(p => (p.page || "").split("/").pop() === currentFile);
    if (idx === -1) return;

    // 이전 n개 / 다음 n개
    const prevPosts = posts.slice(Math.max(0, idx - n), idx).reverse(); // 가까운 것부터
    const nextPosts = posts.slice(idx + 1, idx + 1 + n);

    const renderCards = (arr) => {
        if (!arr.length){
            return `<span class="p2"></span>`;
        }

    return arr.map(p => `
        <a href="${p.page}" class="a-articleBlock1">
            <div class="articleBlock1">
            <img class="articleBlockImg1" src="${p.image}" alt="articleImage">
            <div class="articleBlockTitleCol1">
                <span class="articleBlockTitle1"> ${p.title1}</span>
                <span class="articleBlockTitle2"> ${p.title2 ?? ""}</span>
            </div>
            <div class="articleBlockContent1"></div>
            <div class="articleBlockDate">${p.date}</div>
            <div class="articleBlockNumbering">${p.articleNo ?? ""}</div>
            </div>
        </a>
        `).join("");
    };

    nextMount.innerHTML = renderCards(nextPosts);
    prevMount.innerHTML = renderCards(prevPosts);
}



// 최초 로딩
window.addEventListener("DOMContentLoaded", () => {
    const file = window.location.pathname.split("/").pop(); // 예: "Antartica.html"

    // ✅ 특정 파일에서만 실행
    if (file === "BlogFrame.html") {
        loadPage("blogHome.html");
    }
    renderPrevNextCards(1);
});

