document.addEventListener('DOMContentLoaded', function () {
    const navbar = document.querySelector('.navbar');
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');

    // Navbar scroll effect
    function handleScroll() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    // Mobile menu toggle
    menuToggle.addEventListener('click', function () {
        navMenu.classList.toggle('active');
        menuToggle.classList.toggle('active');
    });

    // Close mobile menu on link click
    navLinks.forEach(link => {
        link.addEventListener('click', function () {
            navMenu.classList.remove('active');
            menuToggle.classList.remove('active');
        });
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Scroll animations using Intersection Observer
    const fadeElements = document.querySelectorAll('.fade-in');

    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver(function (entries, observer) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    fadeElements.forEach(element => {
        observer.observe(element);
    });

    // Add stagger effect to timeline items and skill categories
    const staggerElements = document.querySelectorAll('.timeline-item, .skill-category, .highlight-card');
    staggerElements.forEach((element, index) => {
        element.style.transitionDelay = `${index * 0.1}s`;
    });

    // Writing Section - Load and display posts
    const postsGrid = document.getElementById('posts-grid');
    const postModal = document.getElementById('post-modal');
    const postModalClose = document.getElementById('post-modal-close');
    const postTitle = document.getElementById('post-title');
    const postDate = document.getElementById('post-date');
    const postBody = document.getElementById('post-body');

    async function loadPosts() {
        try {
            const response = await fetch('writing/posts.json');
            const data = await response.json();

            if (data.posts && data.posts.length > 0) {
                renderPosts(data.posts);
            }
        } catch (error) {
            console.log('No posts found or error loading posts:', error);
        }
    }

    function renderPosts(posts) {
        postsGrid.innerHTML = '';

        posts.sort((a, b) => new Date(b.date) - new Date(a.date));

        posts.forEach(post => {
            const card = document.createElement('div');
            card.className = 'post-card fade-in';
            card.innerHTML = `
                <h3>${post.title}</h3>
                <time>${formatDate(post.date)}</time>
                <p>${post.description}</p>
                <span class="read-more">Read more <i class="fas fa-arrow-right"></i></span>
            `;
            card.addEventListener('click', () => openPost(post));
            postsGrid.appendChild(card);

            observer.observe(card);
        });
    }

    function formatDate(dateString) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return new Date(dateString).toLocaleDateString('en-US', options);
    }

    function wrapPostTables(container) {
        container.querySelectorAll('table').forEach(function (table) {
            if (table.parentNode.classList.contains('table-wrapper')) {
                return;
            }
            var wrap = document.createElement('div');
            wrap.className = 'table-wrapper';
            table.parentNode.insertBefore(wrap, table);
            wrap.appendChild(table);
        });
    }

    async function openPost(post) {
        try {
            const response = await fetch(`writing/posts/${post.id}.md`);
            const markdown = await response.text();

            postTitle.textContent = post.title;
            postDate.textContent = formatDate(post.date);
            postBody.innerHTML = marked.parse(markdown, { gfm: true, breaks: false });
            wrapPostTables(postBody);

            if (typeof renderMathInElement === 'function') {
                renderMathInElement(postBody, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false }
                    ],
                    throwOnError: false
                });
            }

            postModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        } catch (error) {
            console.error('Error loading post:', error);
        }
    }

    function closeModal() {
        postModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    postModalClose.addEventListener('click', closeModal);

    postModal.addEventListener('click', function (e) {
        if (e.target === postModal) {
            closeModal();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && postModal.classList.contains('active')) {
            closeModal();
        }
    });

    // Projects Section - Interactive Slider Logic
    const crackSegCard = document.getElementById('crack-seg-card');
    if (crackSegCard) {
        const sliderContainer = crackSegCard.querySelector('.slider-container');
        const sliderRange = crackSegCard.querySelector('.slider-range');
        const tabBtns = crackSegCard.querySelectorAll('.tab-btn');
        const foregroundImg = crackSegCard.querySelector('#foreground-img');

        // 1. Slider Interaction
        sliderRange.addEventListener('input', function (e) {
            const value = e.target.value;
            sliderContainer.style.setProperty('--clip-percent', `${value}%`);
        });

        // 2. Tab Selection (Mask vs Heatmap)
        tabBtns.forEach(btn => {
            btn.addEventListener('click', function (e) {
                // Set active tab
                tabBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');

                const mode = this.getAttribute('data-mode');

                // Update images
                if (mode === 'mask') {
                    foregroundImg.src = 'imgs/crack_mask.webp';
                    foregroundImg.alt = 'Concrete crack segmentation overlay';
                } else if (mode === 'heatmap') {
                    foregroundImg.src = 'imgs/crack_heatmap.webp';
                    foregroundImg.alt = 'Concrete crack density heatmap overlay';
                }
            });
        });
    }

    // BuoyNet Project Card Logic
    const buoynetCard = document.getElementById('buoynet-card');
    if (buoynetCard) {
        const buoynetSlider = document.getElementById('buoynet-slider');
        const buoynetVariantName = document.getElementById('buoynet-variant-name');

        const bnStatAcc = document.getElementById('bn-stat-acc').querySelector('.stat-value');
        const bnStatSize = document.getElementById('bn-stat-size').querySelector('.stat-value');
        const bnStatSizeBadge = document.getElementById('bn-stat-size').querySelector('.savings-badge');
        const bnStatLatency = document.getElementById('bn-stat-latency').querySelector('.stat-value');
        const bnStatEnergy = document.getElementById('bn-stat-energy').querySelector('.stat-value');

        const formatLabel = document.getElementById('sparsity-format');
        const precisionLabel = document.getElementById('precision-format');
        const ticks = buoynetCard.querySelectorAll('.slider-ticks .tick');

        // System Diagnostics dashboard selectors
        const diagStatus = document.getElementById('diag-status');
        const diagValBandwidth = document.getElementById('diag-val-bandwidth');
        const diagBarBandwidth = document.getElementById('diag-bar-bandwidth');
        const diagValCpu = document.getElementById('diag-val-cpu');
        const diagBarCpu = document.getElementById('diag-bar-cpu');
        const diagValBattery = document.getElementById('diag-val-battery');
        const diagBarBattery = document.getElementById('diag-bar-battery');
        const diagLog = document.getElementById('diag-log');

        // Data for the 5 compression levels
        const compressionVariants = [
            {
                name: 'FP32 Baseline',
                accuracy: '98.91%',
                size: '5.98 MB',
                savings: '',
                latency: '370.40 ms',
                energy: '0.2043 J',
                format: 'Dense Checkpoint',
                precision: '32-bit Float'
            },
            {
                name: 'QAT INT8',
                accuracy: '96.10%',
                size: '4.24 MB',
                savings: '-29.1%',
                latency: '346.79 ms',
                energy: '0.1448 J',
                format: 'Dense + Huffman',
                precision: '8-bit Integer'
            },
            {
                name: 'QAT INT8 + Prune 30%',
                accuracy: '95.10%',
                size: '3.04 MB',
                savings: '-49.2%',
                latency: '342.54 ms',
                energy: '0.1038 J',
                format: 'CSR + Huffman (30% Sparse)',
                precision: '8-bit Integer'
            },
            {
                name: 'QAT INT8 + Prune 50%',
                accuracy: '93.60%',
                size: '2.28 MB',
                savings: '-61.9%',
                latency: '339.71 ms',
                energy: '0.0778 J',
                format: 'CSR + Huffman (50% Sparse)',
                precision: '8-bit Integer'
            },
            {
                name: 'QAT INT8 + Prune 70%',
                accuracy: '91.60%',
                size: '1.52 MB',
                savings: '-74.6%',
                latency: '336.88 ms',
                energy: '0.0534 J',
                format: 'CSR + Huffman (70% Sparse)',
                precision: '8-bit Integer'
            }
        ];

        // Hardware Diagnostics Data mapped to compression steps
        const diagnosticsData = [
            {
                statusText: 'DEPLOYMENT CRITICAL',
                statusCode: 'critical',
                statusIcon: 'fa-exclamation-triangle pulse',
                bandwidthVal: '5.98 / 4.00 MB',
                bandwidthPct: 100,
                bandwidthClass: 'bar-critical',
                cpuVal: '370.4 ms',
                cpuPct: 100,
                cpuClass: 'bar-critical',
                batteryVal: '4.2 Days',
                batteryPct: 20,
                batteryClass: 'bar-critical',
                logs: [
                    { type: 'critical', text: '[CRITICAL] Payload size (5.98 MB) exceeds LoRaWAN max session budget (4.00 MB) by +49.5%.' },
                    { type: 'warning', text: '[WARN] Low CPU idle time; active duration (370.4 ms) will cause heat buildup.' },
                    { type: 'critical', text: '[CRITICAL] Battery usage rate exceeds solar recharge; depletion in 4.2 days.' }
                ]
            },
            {
                statusText: 'DEPLOYMENT CRITICAL',
                statusCode: 'critical',
                statusIcon: 'fa-exclamation-triangle pulse',
                bandwidthVal: '4.24 / 4.00 MB',
                bandwidthPct: 100,
                bandwidthClass: 'bar-critical',
                cpuVal: '346.8 ms',
                cpuPct: 90,
                cpuClass: 'bar-warning',
                batteryVal: '6.1 Days',
                batteryPct: 35,
                batteryClass: 'bar-warning',
                logs: [
                    { type: 'critical', text: '[CRITICAL] Payload size (4.24 MB) exceeds LoRaWAN max session budget (4.00 MB) by +6.0%.' },
                    { type: 'info', text: '[INFO] INT8 Quantization active. Latency reduced to 346.8 ms.' },
                    { type: 'warning', text: '[WARN] High CPU active time; estimated battery depletion in 6.1 days.' }
                ]
            },
            {
                statusText: 'COMPATIBLE (REDUCED BATTERY)',
                statusCode: 'warning',
                statusIcon: 'fa-exclamation-circle',
                bandwidthVal: '3.04 / 4.00 MB',
                bandwidthPct: 76,
                bandwidthClass: 'bar-optimal',
                cpuVal: '342.5 ms',
                cpuPct: 85,
                cpuClass: 'bar-warning',
                batteryVal: '8.7 Days',
                batteryPct: 50,
                batteryClass: 'bar-warning',
                logs: [
                    { type: 'ok', text: '[OK] Payload size (3.04 MB) fits within LoRaWAN single-session OTA budget.' },
                    { type: 'info', text: '[INFO] L1 pruning active (30% sparse). Latency: 342.5 ms.' },
                    { type: 'warning', text: '[WARN] Continuous daytime transmission will deplete battery in 8.7 days.' }
                ]
            },
            {
                statusText: 'COMPATIBLE (REDUCED BATTERY)',
                statusCode: 'warning',
                statusIcon: 'fa-exclamation-circle',
                bandwidthVal: '2.28 / 4.00 MB',
                bandwidthPct: 57,
                bandwidthClass: 'bar-optimal',
                cpuVal: '339.7 ms',
                cpuPct: 80,
                cpuClass: 'bar-warning',
                batteryVal: '14.0 Days',
                batteryPct: 70,
                batteryClass: 'bar-warning',
                logs: [
                    { type: 'ok', text: '[OK] Payload size (2.28 MB) fits within LoRaWAN single-session OTA budget.' },
                    { type: 'info', text: '[INFO] Pruning active (50% sparse). Latency: 339.7 ms.' },
                    { type: 'warning', text: '[WARN] Moderate solar recharge dependency. Estimated battery lifetime: 14.0 days.' }
                ]
            },
            {
                statusText: 'OPTIMAL DEPLOYMENT',
                statusCode: 'optimal',
                statusIcon: 'fa-check-circle',
                bandwidthVal: '1.52 / 4.00 MB',
                bandwidthPct: 38,
                bandwidthClass: 'bar-optimal',
                cpuVal: '336.9 ms',
                cpuPct: 35,
                cpuClass: 'bar-optimal',
                batteryVal: 'Self-Sustaining',
                batteryPct: 100,
                batteryClass: 'bar-optimal',
                logs: [
                    { type: 'ok', text: '[OK] Payload size (1.52 MB) fits within LoRaWAN single-session OTA budget.' },
                    { type: 'ok', text: '[OK] 70% sparsity + Huffman compression active. Latency: 336.9 ms.' },
                    { type: 'ok', text: '[OK] Solar power generation exceeds device energy usage' },
                    { type: 'ok', text: '[OK] System Diagnostics: Self-Sustaining IoT deployment.' }
                ]
            }
        ];

        let activeVariant = 0;

        function updateMetrics(index) {
            activeVariant = parseInt(index);
            const data = compressionVariants[activeVariant];

            // Update labels
            buoynetVariantName.textContent = data.name;
            bnStatAcc.textContent = data.accuracy;
            bnStatSize.textContent = data.size;
            bnStatLatency.textContent = data.latency;
            bnStatEnergy.textContent = data.energy;
            formatLabel.textContent = data.format;
            precisionLabel.textContent = data.precision;

            // Update savings badge
            if (data.savings) {
                bnStatSizeBadge.textContent = data.savings;
                bnStatSizeBadge.classList.remove('hidden');
            } else {
                bnStatSizeBadge.classList.add('hidden');
            }

            // Update diagnostics dashboard if elements exist
            if (diagStatus) {
                const diag = diagnosticsData[activeVariant];

                // Update status badge
                diagStatus.className = `diag-status-badge status-${diag.statusCode}`;
                diagStatus.innerHTML = `<i class="fas ${diag.statusIcon}"></i> ${diag.statusText}`;

                // Update bandwidth
                diagValBandwidth.textContent = diag.bandwidthVal;
                diagBarBandwidth.style.width = `${diag.bandwidthPct}%`;
                diagBarBandwidth.className = `diag-bar ${diag.bandwidthClass}`;

                // Update CPU
                diagValCpu.textContent = diag.cpuVal;
                diagBarCpu.style.width = `${diag.cpuPct}%`;
                diagBarCpu.className = `diag-bar ${diag.cpuClass}`;

                // Update Battery
                diagValBattery.textContent = diag.batteryVal;
                diagBarBattery.style.width = `${diag.batteryPct}%`;
                diagBarBattery.className = `diag-bar ${diag.batteryClass}`;

                // Update logs console
                diagLog.innerHTML = diag.logs.map(log =>
                    `<div class="log-line log-${log.type}">${log.text}</div>`
                ).join('');
            }

            // Update slider ticks active state
            ticks.forEach(tick => {
                if (parseInt(tick.getAttribute('data-val')) === activeVariant) {
                    tick.classList.add('active');
                } else {
                    tick.classList.remove('active');
                }
            });

            buoynetSlider.value = activeVariant;
        }

        // Slider listeners
        buoynetSlider.addEventListener('input', function () {
            updateMetrics(this.value);
        });

        // Tick clicks
        ticks.forEach(tick => {
            tick.addEventListener('click', function (e) {
                e.stopPropagation();
                const val = this.getAttribute('data-val');
                updateMetrics(val);
            });
        });

        // Initialize metrics on load
        updateMetrics(0);

        // 2. Tab Switching Logic
        const tabBtns = buoynetCard.querySelectorAll('.visual-tab-btn');
        const panels = buoynetCard.querySelectorAll('.visual-panel');
        let currentTab = 'sparsity';

        tabBtns.forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                tabBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');

                const targetTab = this.getAttribute('data-tab');
                currentTab = targetTab;

                panels.forEach(panel => {
                    if (panel.id === `panel-${targetTab}`) {
                        panel.classList.add('active');
                    } else {
                        panel.classList.remove('active');
                    }
                });

                if (targetTab === 'sparsity') {
                    startSparsityAnimation();
                } else {
                    stopSparsityAnimation();
                }
            });
        });

        // 3. Weight Sparsity Canvas Simulation Animation
        const canvas = document.getElementById('sparsity-canvas');
        const ctx = canvas.getContext('2d');
        const gridWidth = 32;
        const gridHeight = 30;
        let weights = [];
        let animationFrameId = null;

        function initWeights() {
            weights = [];
            for (let y = 0; y < gridHeight; y++) {
                let row = [];
                for (let x = 0; x < gridWidth; x++) {
                    // Generate a nice continuous sine wave base pattern with random noise
                    let val = Math.sin(x * 0.25) * Math.cos(y * 0.35) * 0.6 +
                        Math.sin(x * 0.1 + y * 0.15) * 0.3 +
                        (Math.random() - 0.5) * 0.2;
                    row.push(Math.max(-1, Math.min(1, val)));
                }
                weights.push(row);
            }
        }

        function drawSparsity(time) {
            if (currentTab !== 'sparsity') return;

            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();

            // Match internal dimensions to displayed layout for high DPI screens
            if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                ctx.scale(dpr, dpr);
            }

            const width = rect.width;
            const height = rect.height;
            ctx.clearRect(0, 0, width, height);

            const cellW = width / gridWidth;
            const cellH = height / gridHeight;

            // Model parameters
            const prunePercentages = [0.0, 0.0, 0.30, 0.50, 0.70];
            const prunePct = prunePercentages[activeVariant];
            const isQuantized = activeVariant >= 1;

            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    // Pseudorandom seed derived from position so same index is pruned every time
                    const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
                    const rand = seed - Math.floor(seed);

                    if (rand < prunePct) {
                        // Draw empty slot placeholder
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
                        ctx.beginPath();
                        ctx.arc(x * cellW + cellW / 2, y * cellH + cellH / 2, 1.2, 0, Math.PI * 2);
                        ctx.fill();
                        continue;
                    }

                    let val = weights[y][x];
                    // Animate a slow wave going through the weights
                    let animVal = val + Math.sin(time * 0.0015 + x * 0.4 + y * 0.2) * 0.08;
                    animVal = Math.max(-1, Math.min(1, animVal));

                    if (isQuantized) {
                        // Quantize into 8 discrete bins (bucketing positive/negative levels)
                        const levels = 8;
                        animVal = Math.round(animVal * (levels / 2)) / (levels / 2);
                        animVal = Math.max(-1, Math.min(1, animVal));
                    }

                    // Positive weights are seagreen, negative weights are teal/blue
                    let color;
                    const intensity = Math.abs(animVal);
                    if (animVal >= 0) {
                        color = isQuantized
                            ? `rgba(46, 139, 87, ${0.25 + Math.round(intensity * 4) / 4 * 0.75})`
                            : `rgba(46, 139, 87, ${0.15 + intensity * 0.85})`;
                    } else {
                        color = isQuantized
                            ? `rgba(38, 166, 154, ${0.25 + Math.round(intensity * 4) / 4 * 0.75})`
                            : `rgba(38, 166, 154, ${0.15 + intensity * 0.85})`;
                    }

                    const maxRadius = Math.min(cellW, cellH) * 0.45;
                    const minRadius = Math.min(cellW, cellH) * 0.15;
                    const radius = minRadius + (maxRadius - minRadius) * intensity;

                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(x * cellW + cellW / 2, y * cellH + cellH / 2, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            animationFrameId = requestAnimationFrame(drawSparsity);
        }

        function startSparsityAnimation() {
            if (!animationFrameId) {
                animationFrameId = requestAnimationFrame(drawSparsity);
            }
        }

        function stopSparsityAnimation() {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        }

        // Initialize weight template & canvas render
        initWeights();
        startSparsityAnimation();

    }

    loadPosts();
});
