import { getArticleById } from '../services/articlesService.js';

async function loadArticle() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const loading = document.getElementById('article-loading');
    const content = document.getElementById('article-content');

    if (!id) {
        if (loading) loading.textContent = 'ไม่พบรหัสบทความ (ID)';
        return;
    }

    try {
        const article = await getArticleById(id);

        if (!article) {
            if (loading) loading.textContent = 'ไม่พบบทความนี้ หรือบทความถูกลบไปแล้ว';
            return;
        }

        // Render Meta
        document.title = article.title + ' | Re:Living';

        const catEl = document.getElementById('article-category');
        if (catEl) catEl.textContent = article.category || 'General';

        const titleEl = document.getElementById('article-title');
        if (titleEl) titleEl.textContent = article.title;

        const dateEl = document.getElementById('article-date');
        if (dateEl) {
            const dateStr = new Date(article.created_at).toLocaleDateString('th-TH', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
            dateEl.textContent = dateStr;
        }

        // Render Image
        const cover = document.getElementById('article-cover');
        if (cover) {
            if (article.cover_image) {
                cover.src = article.cover_image;
            } else {
                cover.style.display = 'none';
            }
        }

        // Render Body
        const bodyEl = document.getElementById('article-body');
        if (bodyEl) {
            bodyEl.innerHTML = article.content || '<p>ไม่มีเนื้อหา</p>';
        }

        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'block';

    } catch (err) {
        console.error(err);
        if (loading) loading.textContent = 'เกิดข้อผิดพลาดในการโหลดบทความ';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadArticle();

    // Fix nav links
    document.querySelectorAll('.rl-nav-links a').forEach(a => {
        const href = a.getAttribute('href');
        if (href && href.startsWith('#')) {
            a.href = '/' + href;
        }
    });

    // Mobile nav toggle
    const toggleBtn = document.getElementById('rl-nav-toggle');
    const mobileMenu = document.getElementById('rl-nav-mobile');
    if (toggleBtn && mobileMenu) {
        toggleBtn.addEventListener('click', () => {
            const isOpen = mobileMenu.style.display === 'grid';
            mobileMenu.style.display = isOpen ? 'none' : 'grid';
        });
    }
});
