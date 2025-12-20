export function setupScrollToTop() {
    const scrollBtn = document.getElementById('scroll-to-top');

    const onScroll = () => {
        if (scrollBtn) {
            if (window.scrollY > 300) {
                scrollBtn.classList.add('show');
            } else {
                scrollBtn.classList.remove('show');
            }
        }
    };

    window.addEventListener('scroll', onScroll);
    onScroll(); // verify immediately

    if (scrollBtn) {
        scrollBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
}
