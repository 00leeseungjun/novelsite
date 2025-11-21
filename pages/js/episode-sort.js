// episode-sort.js
document.addEventListener("DOMContentLoaded", () => {
    const tabOrder = document.querySelectorAll(".tab")[1];   // 1화부터 탭
    const episodeList = document.querySelector(".episode-list");

    if (!tabOrder || !episodeList) return;

    tabOrder.addEventListener("click", () => {
        // 1화부터 → 최신순 정렬
        if (tabOrder.textContent === "1화부터") {
            tabOrder.textContent = "최신화부터";
            sortEpisodes(true); // 최신순
        } 
        // 최신화부터 → 1화부터 정렬
        else {
            tabOrder.textContent = "1화부터";
            sortEpisodes(false); // 오름차순
        }
    });

    function sortEpisodes(isLatestFirst) {
        const items = Array.from(episodeList.querySelectorAll(".episode-item"));

        items.sort((a, b) => {
            const numA = Number(a.querySelector(".episode-number").textContent);
            const numB = Number(b.querySelector(".episode-number").textContent);
            return isLatestFirst ? numB - numA : numA - numB;
        });

        episodeList.innerHTML = "";
        items.forEach(i => episodeList.appendChild(i));
    }
});
