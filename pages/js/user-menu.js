document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("userMenuBtn");
    const modal = document.getElementById("userMenuModal");
    const overlay = document.getElementById("userMenuOverlay");

    // 비로그인 페이지에서는 버튼이 없으니까 바로 종료
    if (!btn || !modal || !overlay) return;

    const openMenu = () => {
        modal.classList.remove("hidden");
        overlay.classList.remove("hidden");
    };

    const closeMenu = () => {
        modal.classList.add("hidden");
        overlay.classList.add("hidden");
    };

    btn.addEventListener("click", () => {
        const isOpen = !modal.classList.contains("hidden");
        if (isOpen) closeMenu();
        else openMenu();
    });

    overlay.addEventListener("click", closeMenu);
});
