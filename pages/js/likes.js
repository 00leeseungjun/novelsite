// document.addEventListener("DOMContentLoaded", () => {
//     const btn = document.getElementById("likeBtn");
//     if (!btn) return;

//     btn.addEventListener("click", async () => {
//         const novelId = btn.dataset.novelId;

//         const res = await fetch("/like", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ novelId })
//         });

//         const data = await res.json();

//         document.getElementById("likeCount").textContent = data.likes;

//         // 버튼 상태 변경
//         if (data.liked) {
//             btn.textContent = `❤️ 관심 (${data.likes})`;
//         } else {
//             btn.textContent = `🤍 관심 (${data.likes})`;
//         }
//     });
// });


document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("likeBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const novelId = btn.dataset.novelId;

        const res = await fetch("/like", {
            method: "POST",
            credentials: "include",   // ⭐⭐ 쿠키(세션) 포함 ⭐⭐
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ novelId })
        });

        const data = await res.json();

        document.getElementById("likeCount").textContent = data.likes;

        if (data.liked) {
            btn.textContent = `❤️ 관심 (${data.likes})`;
        } else {
            btn.textContent = `🤍 관심 (${data.likes})`;
        }
    });
});

