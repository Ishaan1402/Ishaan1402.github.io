(function () {
    'use strict';

    /* Dark mode toggle */
    var themeToggle = document.getElementById('theme-toggle');
    var savedTheme = null;
    try {
        savedTheme = localStorage.getItem('theme');
    } catch (e) { /* storage unavailable */ }

    if (savedTheme === 'dark') {
        document.documentElement.dataset.theme = 'dark';
        if (themeToggle) themeToggle.checked = true;
    }

    if (themeToggle) {
        themeToggle.addEventListener('change', function () {
            var dark = themeToggle.checked;
            document.documentElement.dataset.theme = dark ? 'dark' : 'light';
            try {
                localStorage.setItem('theme', dark ? 'dark' : 'light');
            } catch (e) { /* storage unavailable */ }
        });
    }

    /* Crack segmentation before/after slider */
    var range = document.getElementById('crack-range');
    var fg = document.getElementById('crack-fg');
    var handle = document.getElementById('crack-handle');

    function updateSlider(v) {
        var p = 100 - v;
        if (fg) fg.style.clipPath = 'inset(0 ' + p + '% 0 0)';
        if (handle) handle.style.left = v + '%';
    }

    if (range) {
        range.addEventListener('input', function () {
            updateSlider(range.value);
        });
        updateSlider(range.value);
    }

    /* Post modal */
    var modal = document.getElementById('post-modal');
    var openBtn = document.getElementById('open-post');
    var closeBtn = document.getElementById('post-close');
    var titleEl = document.getElementById('post-title');
    var dateEl = document.getElementById('post-date');
    var bodyEl = document.getElementById('post-body');

    function formatDate(dateString) {
        var options = { year: 'numeric', month: 'long', day: 'numeric' };
        return new Date(dateString).toLocaleDateString('en-US', options);
    }

    function wrapTables(container) {
        container.querySelectorAll('table').forEach(function (table) {
            if (table.parentNode && table.parentNode.classList.contains('table-wrap')) return;
            var wrapper = document.createElement('div');
            wrapper.className = 'table-wrap';
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        });
    }

    function openPost() {
        if (!modal) return;
        fetch('writing/posts/learned-indexes-intro.md')
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
            })
            .then(function (markdown) {
                if (typeof marked === 'undefined') throw new Error('marked unavailable');
                titleEl.textContent = 'Notes on Learned Indexes';
                dateEl.textContent = formatDate('2026-02-24');
                bodyEl.innerHTML = marked.parse(markdown, { gfm: true, breaks: false });
                wrapTables(bodyEl);
                if (typeof renderMathInElement === 'function') {
                    renderMathInElement(bodyEl, {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '$', right: '$', display: false }
                        ],
                        throwOnError: false
                    });
                }
                modal.hidden = false;
                document.body.classList.add('modal-open');
            })
            .catch(function (error) {
                console.error('Failed to load post:', error);
                titleEl.textContent = 'Notes on Learned Indexes';
                dateEl.textContent = formatDate('2026-02-24');
                bodyEl.innerHTML = '<p class="post-error">Could not load the post right now. It may have been moved or renamed.</p>';
                modal.hidden = false;
                document.body.classList.add('modal-open');
            });
    }

    function closePost() {
        if (!modal) return;
        modal.hidden = true;
        document.body.classList.remove('modal-open');
    }

    if (openBtn) {
        openBtn.addEventListener('click', function (e) {
            e.preventDefault();
            openPost();
        });
    }
    if (closeBtn) closeBtn.addEventListener('click', closePost);
    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closePost();
        });
    }
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closePost();
    });

    /* Image lightbox: click any work visual to view full size */
    var lightbox = document.getElementById('lightbox');
    var lightboxContent = document.getElementById('lightbox-content');

    function openLightbox(node) {
        if (!lightbox) return;
        lightboxContent.innerHTML = '';
        if (node.tagName === 'IMG') {
            var img = document.createElement('img');
            img.src = node.currentSrc || node.src;
            img.alt = node.alt;
            lightboxContent.appendChild(img);
        } else {
            lightboxContent.appendChild(node.cloneNode(true));
        }
        lightbox.hidden = false;
        document.body.classList.add('modal-open');
    }

    document.querySelectorAll('.work-visual > img, .work-visual > svg').forEach(function (node) {
        node.addEventListener('click', function () {
            openLightbox(node);
        });
    });

    if (lightbox) {
        lightbox.addEventListener('click', function () {
            lightbox.hidden = true;
            document.body.classList.remove('modal-open');
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (lightbox && !lightbox.hidden) {
                lightbox.hidden = true;
                document.body.classList.remove('modal-open');
            }
        }
    });
})();
