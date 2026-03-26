document.addEventListener('DOMContentLoaded', function() {
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
    menuToggle.addEventListener('click', function() {
        navMenu.classList.toggle('active');
        menuToggle.classList.toggle('active');
    });

    // Close mobile menu on link click
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            navMenu.classList.remove('active');
            menuToggle.classList.remove('active');
        });
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
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

    const observer = new IntersectionObserver(function(entries, observer) {
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

    async function openPost(post) {
        try {
            const response = await fetch(`writing/posts/${post.id}.md`);
            const markdown = await response.text();
            
            postTitle.textContent = post.title;
            postDate.textContent = formatDate(post.date);
            postBody.innerHTML = marked.parse(markdown);
            
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
    
    postModal.addEventListener('click', function(e) {
        if (e.target === postModal) {
            closeModal();
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && postModal.classList.contains('active')) {
            closeModal();
        }
    });

    loadPosts();
});
