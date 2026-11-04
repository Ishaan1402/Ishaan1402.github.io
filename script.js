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

    /* Eir: a fixed fictional demo excerpt, not live extraction or triage. */
    var evidenceButtons = document.querySelectorAll('[data-evidence]');
    evidenceButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            evidenceButtons.forEach(function (option) {
                var selected = option === button;
                option.setAttribute('aria-pressed', String(selected));
                document.getElementById(option.getAttribute('aria-controls')).classList.toggle('is-selected', selected);
            });
            document.getElementById('eir-source-announcement').textContent = button.dataset.evidence === 'hr'
                ? 'Heart rate 128 bpm. Source: Heart rate 128.'
                : 'Blood pressure 92 over 58 mmHg. Source: BP 92 over 58.';
        });
    });

    /* Pathfinder: real resource capabilities, with no fabricated run metrics. */
    var inspectButton = document.getElementById('inspect-run');
    if (inspectButton) {
        inspectButton.addEventListener('click', function () {
            var inspecting = inspectButton.getAttribute('aria-expanded') !== 'true';
            inspectButton.setAttribute('aria-expanded', String(inspecting));
            document.getElementById('pathfinder-visual').classList.toggle('is-inspecting', inspecting);
            document.getElementById('study-packet').hidden = !inspecting;
            document.getElementById('packet-rest').hidden = inspecting;
        });
    }

    /* BuoyNet: measured variants from the repository's Results table.
       The deterministic weight grid illustrates sparsity, not checkpoint weights.
       Payload is CSR + Huffman size, not dense in-memory model size. */
    var variants = [
        { name: 'FP32 baseline', size: 5.98, accuracy: 98.91, pruning: 0, bits: 32 },
        { name: 'QAT INT8', size: 4.24, accuracy: 96.10, pruning: 0, bits: 8 },
        { name: 'INT8 + 30% pruning', size: 3.04, accuracy: 95.10, pruning: 30, bits: 8 },
        { name: 'INT8 + 50% pruning', size: 2.28, accuracy: 93.60, pruning: 50, bits: 8 },
        { name: 'INT8 + 70% pruning', size: 1.52, accuracy: 91.60, pruning: 70, bits: 8 }
    ];
    var compressionRange = document.getElementById('compression-range');
    var weightGrid = document.getElementById('weight-grid');
    if (compressionRange && weightGrid) {
        var cells = [];
        for (var i = 0; i < 100; i++) {
            var cell = document.createElement('span');
            cell.className = 'weight-cell';
            cell.dataset.rank = (i * 37 + 13) % 100;
            weightGrid.appendChild(cell);
            cells.push(cell);
        }
        function updateCompression() {
            var index = Number(compressionRange.value);
            var variant = variants[index];
            document.getElementById('variant-name').textContent = variant.name;
            document.getElementById('variant-step').textContent = (index + 1) + ' / 5';
            document.getElementById('variant-size').textContent = variant.size.toFixed(2);
            document.getElementById('variant-accuracy').textContent = variant.accuracy.toFixed(2);
            document.getElementById('weight-precision').textContent = variant.bits + '-bit';
            compressionRange.setAttribute('aria-valuetext', variant.name + ': ' + variant.size.toFixed(2) + ' MB, ' + variant.accuracy.toFixed(2) + ' percent accuracy');
            var point = document.getElementById('variant-point');
            point.setAttribute('cx', 28 + variant.size * 19);
            point.setAttribute('cy', 106 - (variant.accuracy - 90) * 9.2);
            cells.forEach(function (weight) {
                var rank = Number(weight.dataset.rank);
                var magnitude = (rank + 0.5) / 100;
                if (variant.bits === 8) magnitude = Math.round(magnitude * 255) / 255;
                weight.style.opacity = 0.15 + magnitude * 0.85;
                weight.classList.toggle('is-pruned', rank < variant.pruning);
            });
        }
        compressionRange.addEventListener('input', updateCompression);
        updateCompression();
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
