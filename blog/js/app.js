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

    const posts = await fetch("/blog/data/article.json").then(r => r.json());
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

// 최초 로딩
window.addEventListener("DOMContentLoaded", () => {
    loadPage("blogHome.html");
});

// (선택) 콘솔에서도 쓸 수 있게 전역으로 노출하고 싶으면
window.loadPage = loadPage;
