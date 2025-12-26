import { getPublishedArticles } from '../services/articlesService.js';
import { clear } from '../ui/dom.js';

async function loadAllArticles() {
    const grid = document.getElementById('articles-grid');
    const loading = document.getElementById('articles-loading');

    if (!grid || !loading) return;

    try {
        // Fetch all (limit 100 for now)
        const articles = await getPublishedArticles(100);

        if (!articles || !articles.length) {
            loading.textContent = 'ไม่พบบทความ';
            return;
        }

        loading.style.display = 'none';
        grid.style.display = 'grid';
        grid.innerHTML = '';

        articles.forEach(article => {
            const link = `/article.html?id=${article.id}`;
            const cover = article.cover_image || 'https://placehold.co/600x400?text=No+Image';

            const card = document.createElement('article');
            card.className = 'rl-article-card';
            card.style.cssText = 'background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.05); transition:transform 0.3s ease; display:flex; flex-direction:column;';
            card.innerHTML = `
            <a href="${link}" class="rl-article-thumb" style="height:200px; display:block; overflow:hidden;">
               <img src="${cover}" alt="${article.title}" style="width:100%; height:100%; object-fit:cover; transition:transform 0.5s ease;">
            </a>
            <div class="rl-article-content" style="padding:1.5rem; flex:1; display:flex; flex-direction:column;">
               <span style="font-size:0.8rem; color:#d97706; font-weight:700; text-transform:uppercase; letter-spacing:1px;">${article.category || 'General'}</span>
               <h3 style="font-size:1.25rem; margin:0.5rem 0 0.8rem; color:#333;">
                  <a href="${link}" style="color:inherit; text-decoration:none;">${article.title}</a>
               </h3>
               <p style="font-size:0.95rem; color:#666; margin-bottom:1.5rem; line-height:1.6; flex:1;">${article.excerpt || ''}</p>
               <a href="${link}" style="color:#b45309; text-decoration:none; font-weight:600; display:inline-flex; align-items:center;">
                 อ่านเพิ่มเติม <span style="margin-left:4px;">→</span>
               </a>
            </div>
        `;
            grid.appendChild(card);
        });

    } catch (err) {
        console.error(err);
        loading.textContent = 'โหลดข้อมูลล้มเหลว';
    }
}

// Add simple hover effect via CSS injection
const style = document.createElement('style');
style.textContent = `
  .rl-article-card:hover { transform: translateY(-5px) !important; box-shadow: 0 8px 30px rgba(0,0,0,0.12) !important; }
  .rl-article-card:hover img { transform: scale(1.05) !important; }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', () => {
    loadAllArticles();

    // Fix nav links to be absolute paths
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
