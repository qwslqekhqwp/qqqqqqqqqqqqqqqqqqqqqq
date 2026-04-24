// ==========================================
// 1. КОНФИГУРАЦИЯ И КОНСТАНТЫ
// ==========================================

// TMDB API конфигурация для поиска фильмов
const TMDB_API_KEY = 'eecb39fda32865ef3e751f0b2ee79cdd'; 
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// Supabase конфигурация для хранения данных
const supabaseUrl = 'https://kasckwaquxvafkrltblo.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imthc2Nrd2FxdXh2YWZrcmx0YmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MTEyMzksImV4cCI6MjA5MjI4NzIzOX0.fCp_eqlMQk7bWp3ltJYdX7S5eJd8X7897jfqZfXGaww';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// Коды доступа: "777" для "я" и "888" для "сашок-петушок"
const ACCESS_CODES = { 
	"777": { role: "me", name: "я" }, 
	"888": { role: "any", name: "сашок-петушок" } 
};

// ==========================================
// 2. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==========================================

let currentUser = localStorage.getItem('userRole');           // Текущий пользователь
let currentUserName = localStorage.getItem('userName');       // Имя текущего пользователя
let allMovies = [];                                           // Массив всех фильмов
let currentMovieId = null;                                    // ID фильма в модальном окне
let isEditMode = false;                                       // Режим редактирования данных фильма
let tempExternalRating = null;                                // Временное хранилище рейтинга TMDB
let currentRouletteMovies = [];                               // Фильмы для рулетки
let isSpinning = false;                                       // Флаг вращения рулетки
let wheelAngle = 0;  
let currentRadarView = 'both'; // Состояние видимости графика: 'me', 'any', 'both'                                         // Текущий угол поворота колеса

// ==========================================
// 3. АУТЕНТИФИКАЦИЯ
// ==========================================

/**
 * Проверяет статус аутентификации пользователя
 * Показывает экран входа если пользователь не авторизован
 * Загружает фильмы если пользователь авторизован
 */
function checkAuth() {
    const authScreen = document.getElementById('auth-screen');
    const userBadge = document.getElementById('user-display');
    
    if (!currentUser) {
        // Показываем экран входа
        authScreen.style.display = 'flex'; 
    } else {
        // Скрываем экран входа и загружаем данные
        authScreen.style.display = 'none';
        userBadge.innerText = currentUserName;
        fetchMovies();
    }
}

/**
 * Вход в систему по секретному коду
 * Сохраняет роль и имя пользователя в localStorage
 */
function login() {
    const code = document.getElementById('secret-code').value;
    
    if (ACCESS_CODES[code]) {
        currentUser = ACCESS_CODES[code].role;
        currentUserName = ACCESS_CODES[code].name;
        localStorage.setItem('userRole', currentUser);
        localStorage.setItem('userName', currentUserName);
        checkAuth();
    } else {
        showToast("Неверный код доступа", "error");
    }
}

/**
 * Выход из системы
 * Очищает localStorage и перезагружает страницу
 */
function logout() {
    localStorage.clear();
    location.reload();
}

// ==========================================
// 4. ЗАГРУЗКА И УПРАВЛЕНИЕ ФИЛЬМАМИ
// ==========================================

/**
 * Загружает все фильмы из базы данных Supabase
 * Обновляет фильтры и отображение после загрузки
 */
async function fetchMovies() {
    // Включаем скелеты до того, как данные загрузились
    renderSkeletons();
    
    const { data, error } = await supabaseClient.from('movies').select('*');
    
    if (error) {
        showToast("Ошибка подключения к базе", "error");
        console.error(error);
    } else {
        allMovies = data;
        updateFilterOptions();
        applyFilters(); // Эта функция сама удалит скелеты и нарисует фильмы
    }
}

/**
 * Удаляет фильм из базы данных
 * Требует подтверждение пользователя
 */
async function deleteMovie() {
    if (confirm("Удалить?")) {
        await supabaseClient.from('movies').delete().eq('id', currentMovieId);
        location.reload();
    }
}

/**
 * Сохраняет все изменения в оценках и данных фильма
 * Обновляет базу данных и перезагружает страницу
 */
async function saveRatings() {
    const updateData = { 
        review_common: document.getElementById('review-common').value, 
        status: document.getElementById('edit-status').value,
        updated_at: new Date().toISOString()
    };
    
    if (isEditMode) {
        // Сохраняем данные фильма если находимся в режиме редактирования
        updateData.title = document.getElementById('edit-title').value;
        updateData.poster = document.getElementById('edit-poster').value;
        updateData.year = document.getElementById('edit-year').value;
        updateData.duration = parseInt(document.getElementById('edit-duration').value) || 0;
        updateData.genre = document.getElementById('edit-genre').value;
        updateData.producer = document.getElementById('edit-producer').value;
        updateData.actors = document.getElementById('edit-actors').value;
        updateData.external_rating = document.getElementById('edit-external-rating').value;
        updateData.kp_rating = document.getElementById('edit-kp-rating').value;
    }
    
    // Сохраняем оценки текущего пользователя
    ['plot', 'ending', 'reviewability', 'actors', 'atmosphere', 'music'].forEach(f => {
        const input = document.getElementById(`input-${f}_${currentUser}`);
        if (input) updateData[`${f}_${currentUser}`] = parseInt(input.value) || 0;
    });
    
    const { error } = await supabaseClient.from('movies').update(updateData).eq('id', currentMovieId);
    if (error) showToast("Ошибка сохранения", "error"); else { showToast("Сохранено!", "success"); setTimeout(() => location.reload(), 800); }
}

// ==========================================
// 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

/**
 * Форматирует дату в формат ДД.МММ.ГГГГ
 * @param {string} dateString - ISO строка даты
 * @returns {string} Отформатированная дата или "—" если дата пуста
 */
function formatDate(dateString) {
    if (!dateString) return '—';
    
    const d = new Date(dateString);
    return d.toLocaleDateString('ru-RU', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
    });
}

/**
 * Показывает стильное всплывающее уведомление (с поддержкой свайпа)
 * @param {string} message - Текст уведомления
 * @param {string} type - Тип (success, error, warning, info)
 */
function showToast(message, type = "info") {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    
    // Строгий монохром, меняем только иконку
    let icon = "❕"; 
    if (type === "success") icon = "✓";
    if (type === "error") icon = "✕";
    if (type === "warning") icon = "⚠";

    toast.innerHTML = `<span style="font-size: 1.1rem; font-weight: 900;">${icon}</span> ${message}`;

    // Закрытие по обычному клику (оставляем для пользователей с мышкой)
    toast.onclick = () => {
        toast.classList.add('closing');
        setTimeout(() => toast.remove(), 300);
    };

    // === НОВАЯ ЛОГИКА: СВАЙП НА МОБИЛЬНЫХ УСТРОЙСТВАХ ===
    let startX = 0;
    let currentX = 0;
    let isDragging = false;

    // 1. Палец коснулся плашки
    toast.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
        toast.style.transition = 'none'; // Отключаем плавность, чтобы плашка прилипла к пальцу
    }, { passive: true });

    // 2. Палец двигается
    toast.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
        const diffX = currentX - startX;

        // Сдвигаем плашку за пальцем и плавно растворяем (на 150px сдвига будет 0 непрозрачности)
        toast.style.transform = `translateX(${diffX}px)`;
        toast.style.opacity = Math.max(0, 1 - Math.abs(diffX) / 150); 
    }, { passive: true });

    // 3. Палец отпустили
    toast.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        const diffX = currentX - startX;

        // Включаем плавную анимацию для завершения свайпа
        toast.style.transition = 'transform 0.3s ease, opacity 0.3s ease'; 

        if (Math.abs(diffX) > 70) {
            // Если свайпнули достаточно далеко (больше 70px) -> уводим за экран и удаляем
            const direction = diffX > 0 ? 1 : -1;
            toast.style.transform = `translateX(${direction * 300}px)`;
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        } else {
            // Если свайпнули слабо -> пружиним обратно в центр
            toast.style.transform = `translateX(0)`;
            toast.style.opacity = '1';
        }
    });
    // ====================================================

    container.appendChild(toast);

    // Авто-удаление через 3.5 секунды (если не смахнули раньше)
    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('closing');
            setTimeout(() => toast.remove(), 300);
        }
    }, 3500);
}

/**
 * Отрисовывает пульсирующие скелеты на месте фильмов во время загрузки
 */
function renderSkeletons() {
    const grid = document.getElementById('movie-grid');
    if (!grid) return;
    grid.innerHTML = '';
    // Рисуем 8 заглушек
    for(let i=0; i<8; i++) {
        grid.innerHTML += `
            <div class="skeleton-card">
                <div class="skeleton-img skeleton-anim"></div>
                <div class="skeleton-text skeleton-anim"></div>
                <div class="skeleton-badge skeleton-anim"></div>
            </div>
        `;
    }
}

// ==========================================
// 6. ФИЛЬТРАЦИЯ, СОРТИРОВКА И РАСЧЕТЫ
// ==========================================

/**
 * Обновляет список опций в фильтрах (жанры и режиссеры)
 * Парсит данные из всех фильмов
 */
function updateFilterOptions() {
    const genres = new Set();
    const producers = new Set();
    
    allMovies.forEach(m => {
        // Извлекаем жанры
        if (m.genre) {
            m.genre.split(',').forEach(g => {
                let formattedGenre = g.trim();
                if (formattedGenre) {
                    formattedGenre = formattedGenre.charAt(0).toUpperCase() + formattedGenre.slice(1).toLowerCase();
                    genres.add(formattedGenre);
                }
            });
        }
        // Извлекаем режиссеров
        if (m.producer) {
            producers.add(m.producer.trim());
        }
    });
    
    fillSelect('filter-genre', genres, 'жанры'); 
    fillSelect('filter-producer', producers, 'режиссеры');
}

/**
 * Заполняет select элемент опциями из Set
 * @param {string} id - ID select элемента
 * @param {Set} set - Set с опциями
 * @param {string} label - Название фильтра
 */
function fillSelect(id, set, label) {
    const s = document.getElementById(id);
    let shortLabel = label;
    
    if (label === 'жанры') shortLabel = 'жанры';
    if (label === 'режиссеры') shortLabel = 'режиссеры';
    
    s.innerHTML = `<option value="">Все ${shortLabel}</option>`;
    Array.from(set).sort().forEach(i => {
        s.innerHTML += `<option value="${i}">${i}</option>`;
    });
}

/**
 * Применяет все активные фильтры (поиск, жанр, режиссер, статус оценки)
 * и сортирует результаты
 */
function applyFilters() {
    const search = document.getElementById('search-input').value.toLowerCase();
    const genre = document.getElementById('filter-genre').value;
    const prod = document.getElementById('filter-producer').value;
    const assessment = document.getElementById('filter-assessment').value; 
    const sort = document.getElementById('sort-select').value;

    let filtered = allMovies.filter(m => {
        // Проверка поиска, жанра и режиссера
        const matchesSearch = m.title.toLowerCase().includes(search);
        const matchesGenre = !genre || (m.genre && m.genre.toLowerCase().includes(genre.toLowerCase()));
        const matchesProd = !prod || m.producer === prod;

        // ЛОГИКА ФИЛЬТРАЦИИ ПО СТАТУСУ И ОЦЕНКАМ
        // Считаем, были ли оценки от каждого пользователя
        const hasMe = (Number(m.plot_me || 0) + Number(m.ending_me || 0) + Number(m.actors_me || 0) + Number(m.reviewability_me || 0) + Number(m.atmosphere_me || 0) + Number(m.music_me || 0)) > 0;
        const hasAny = (Number(m.plot_any || 0) + Number(m.ending_any || 0) + Number(m.actors_any || 0) + Number(m.reviewability_any || 0) + Number(m.atmosphere_any || 0) + Number(m.music_any || 0)) > 0;
        const isWatched = m.status === 'Просмотрено';

        let matchesAssessment = true;

        // Фильтрация по оценкам
        if (assessment === 'not_watched') {
            matchesAssessment = (m.status === 'Не просмотрено');
        } else {
            // Если фильм не просмотрен — убираем его из списков кроме "not_watched"
            if (!isWatched) return false;

            if (assessment === 'both') matchesAssessment = hasMe && hasAny;
            else if (assessment === 'only_me') matchesAssessment = hasMe && !hasAny;
            else if (assessment === 'only_any') matchesAssessment = !hasMe && hasAny;
            else if (assessment === 'none') matchesAssessment = !hasMe && !hasAny;
        }

        return matchesSearch && matchesGenre && matchesProd && matchesAssessment;
    });

    // Сортировка результатов
    // Сортировка результатов
    filtered.sort((a, b) => {
        // 1. Сначала проверяем стандартные сортировки
        if (sort === 'rating-desc') return calculateRating(b).total - calculateRating(a).total;
        if (sort === 'title-asc') return a.title.localeCompare(b.title);
        
        // 2. Затем — «Самые спорные» (которые мы добавили ранее)
        if (sort === 'controversial') {
            const rA = calculateRating(a);
            const rB = calculateRating(b);
            const diffA = Math.abs(rA.me - rA.any);
            const diffB = Math.abs(rB.me - rB.any);
            return diffB - diffA; // Чем больше разница, тем выше в списке
        }

        // === ВОТ ЭТО ШАГ Б (ВСТАВЬ ЭТО СЮДА) ===
        if (sort === 'agreed') {
            const rA = calculateRating(a);
            const rB = calculateRating(b);
            
            // Считаем абсолютную разницу между вашими оценками для каждого фильма
            const diffA = Math.abs(rA.me - rA.any);
            const diffB = Math.abs(rB.me - rB.any);
            
            // Сортируем: чем МЕНЬШЕ разница (diffA), тем ВЫШЕ фильм в списке
            return diffA - diffB; 
        }
        // ======================================

        // 3. Если ничего не выбрано, сортируем по дате добавления
        return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    });

    renderMovies(filtered);
}

/**
 * Рассчитывает средний рейтинг фильма по взвешенной системе
 * Веса: сюжет (40%) → концовка (25%) → пересмотрваемость (15%) → актеры (10%) → атмосфера (5%) → звук (5%)
 * @param {object} m - Объект фильма
 * @returns {object} { me, any, total } - Оценки для каждого пользователя и среднее
 */
function calculateRating(m) {
    const weights = { 
        plot: 0.40,           // Вес сюжета
        end: 0.25,            // Вес концовки
        rev: 0.15,            // Вес пересмотрваемости
        act: 0.10,            // Вес актерского мастерства
        atm: 0.05,            // Вес атмосферы
        mus: 0.05             // Вес музыки
    };
    
    const getValue = (val) => parseFloat(val) || 0;
    
    const getScore = (user) => 
        getValue(m['plot_'+user]) * weights.plot + 
        getValue(m['ending_'+user]) * weights.end + 
        getValue(m['reviewability_'+user]) * weights.rev + 
        getValue(m['actors_'+user]) * weights.act + 
        getValue(m['atmosphere_'+user]) * weights.atm + 
        getValue(m['music_'+user]) * weights.mus;
    
    const me = getScore('me');
    const any = getScore('any');
    
    return { 
        me, 
        any, 
        total: (me + any) / 2 
    };
}

// ==========================================
// 7. РЕНДЕРИНГ ФИЛЬМОВ В СЕТКУ
// ==========================================

/**
 * Отображает фильмы в виде сетки карточек
 * Добавляет анимацию появления и интерактивность
 * @param {array} movies - Массив фильмов для отображения
 */
function renderMovies(movies) {
    const grid = document.getElementById('movie-grid'); 
    grid.innerHTML = ''; 
    
    movies.forEach((m, index) => {
        const r = calculateRating(m);

        // Проверяем: если СУММА всех оценок человека больше 0, значит он оценивал
        const hasMe = (Number(m.plot_me || 0) + Number(m.ending_me || 0) + Number(m.actors_me || 0) + Number(m.reviewability_me || 0) + Number(m.atmosphere_me || 0) + Number(m.music_me || 0)) > 0;
        const hasAny = (Number(m.plot_any || 0) + Number(m.ending_any || 0) + Number(m.actors_any || 0) + Number(m.reviewability_any || 0) + Number(m.atmosphere_any || 0) + Number(m.music_any || 0)) > 0;

        // Определяем стиль плашки рейтинга в зависимости от того, кто оценил
        let badgeStyle = "";
        if (hasMe && hasAny) {
            badgeStyle = "background-color: #c0c0c0; color: #111;";  // Оба оценили
        } else if (hasMe || hasAny) {
            badgeStyle = "background: linear-gradient(90deg, #c0c0c0 50%, rgba(40, 40, 40, 0.9) 50%); color: #fff; border: none;";  // Оценил только один
        } else {
            badgeStyle = "background-color: #1a1a1a; color: #555;";  // Никто не оценил
        }

        const dateToShow = m.updated_at || m.created_at;
        const viewedBadge = m.status === 'Просмотрено' ? `<div class="viewed-badge">Просмотрено</div>` : '';
        
        const card = document.createElement('div');
        card.className = 'card';
        card.style.animationDelay = `${index * 0.05}s`;
        card.onclick = () => openModalById(m.id);
        
        card.innerHTML = `
            ${viewedBadge}
            
            <div class="card-overlay">
                <div class="overlay-score-item">
                    <div class="overlay-label">УМНЫЙ</div>
                    <div class="overlay-val">${r.me.toFixed(1)}</div>
                </div>
                <div style="width: 30px; height: 1px; background: rgba(255,255,255,0.1); margin: 5px 0;"></div>
                <div class="overlay-score-item">
                    <div class="overlay-label">НЕ УМНЫЙ</div>
                    <div class="overlay-val">${r.any.toFixed(1)}</div>
                </div>
            </div>

            <img src="${m.poster || 'https://via.placeholder.com/180x260?text=No+Poster'}">
            <div class="card-info">
                <div class="card-top-content">
                    <h3 style="margin: 0 0 8px 0; font-size: 0.9rem; line-height: 1.2;">${m.title}</h3>
                    <span class="rating-badge" style="${badgeStyle}">${r.total.toFixed(1)}</span>
                </div>
                <div class="card-date">Обновлено: ${formatDate(dateToShow)}</div>
            </div>`;
            
        grid.appendChild(card);
    });
}

// ==========================================
// 8. МОДАЛЬНОЕ ОКНО И РЕДАКТИРОВАНИЕ ОЦЕНОК
// ==========================================

/**
 * Открывает модальное окно для фильма по ID
 * @param {number} id - ID фильма
 */
function openModalById(id) {
    const movie = allMovies.find(m => m.id == id);
    if (!movie) return;
    
    currentMovieId = movie.id;
    isEditMode = false;
    renderModalContent(movie);
    document.getElementById('movie-modal').style.display = 'block';
}

/**
 * Закрывает модальное окно с анимацией
 */
function closeModal() {
    const modal = document.getElementById('movie-modal');
    const modalContent = modal.querySelector('.modal-content');
    
    modalContent.classList.add('closing');
    modal.classList.add('fade-out');
    
    setTimeout(() => {
        modal.style.display = 'none';
        modalContent.classList.remove('closing');
        modal.classList.remove('fade-out');
        modal.style.opacity = '1';
    }, 300);
}

/**
 * Рендерит содержимое модального окна
 * Показывает информацию о фильме, ползунки оценок и поле для комментария
 * @param {object} m - Объект фильма
 */
function renderModalContent(m) {
    const body = document.getElementById('modal-body');
    const r = calculateRating(m);
    const dateToShow = m.updated_at || m.created_at;
    const isViewed = m.status === 'Просмотрено';

    body.innerHTML = `
        <div style="display:flex; gap:20px; margin-bottom:20px; position: relative;">
            <img src="${m.poster || ''}" style="width:120px; height:180px; object-fit:cover; border-radius:10px; border:1px solid #333;">
            <div style="flex:1">
                ${isEditMode ? `
                    <input type="text" id="edit-title" value="${m.title}" placeholder="Название">
                    <input type="text" id="edit-poster" value="${m.poster || ''}" placeholder="URL постера">
                    <input type="text" id="edit-year" value="${m.year || ''}" placeholder="Год">
                    <input type="number" id="edit-duration" value="${m.duration || ''}" placeholder="Длительность (мин)">
                    <input type="text" id="edit-genre" value="${m.genre || ''}" placeholder="Жанр">
                    <input type="text" id="edit-producer" value="${m.producer || ''}" placeholder="Режиссер">
                    <input type="text" id="edit-actors" value="${m.actors || ''}" placeholder="Актеры">
                    <input type="text" id="edit-external-rating" value="${m.external_rating || ''}" placeholder="Рейтинг TMDB">
                    <div class="score-group">
                        <label style="font-size: 0.7rem; color: #666; display: block; margin-bottom: 5px;">РЕЙТИНГ КИНОПОИСКА</label>
                        <input type="number" id="edit-kp-rating" value="${m.kp_rating || ''}" step="0.1" style="margin-bottom: 0;">
                    </div>
                ` : `
                    <h2 style="margin:0;">${m.title}</h2>
                    <p style="color:#888; font-size:0.8rem; margin:5px 0;">${m.year || ''} • ${m.genre || ''} ${m.duration ? '• ' + m.duration + ' мин' : ''}</p>
                    <div style="display: flex; align-items: center; gap: 8px; margin: 5px 0;">
                        <span style="background: #E1B22E; color: #000; padding: 2px 5px; border-radius: 4px; font-weight: bold; font-size: 0.6rem;">TMDB</span>
                        <span style="font-size: 0.9rem; color: #fff;">${m.external_rating || '—'}</span>
                        <span style="background: #ef7f1a; color: #000; padding: 2px 5px; border-radius: 4px; font-weight: bold; font-size: 0.6rem;">КП</span>
                        <span style="font-size: 0.9rem; color: #fff;">${m.kp_rating || '—'}</span>
                    </div>
                    <p style="color:#666; font-size:0.7rem; margin:2px 0;">Режиссер: ${m.producer || '—'}</p>
                    <p style="color:#666; font-size:0.7rem; margin:2px 0;">В ролях: ${m.actors || '—'}</p>
                `}

                <div id="status-toggle" 
                     onclick="toggleMovieStatus()" 
                     style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px 12px; border-radius: 20px; 
                            border: 1px solid ${isViewed ? '#ccc' : '#444'}; 
                            background: ${isViewed ? 'rgba(255, 255, 255, 0.08)' : 'transparent'}; 
                            box-shadow: ${isViewed ? '0 0 15px rgba(255, 255, 255, 0.05)' : 'none'};
                            margin-top: 10px; transition: all 0.3s ease;">
                    <span id="status-icon" style="color: ${isViewed ? '#ccc' : '#666'}; font-size: 1.1rem;">
                        ${isViewed ? '✓' : '○'}
                    </span>
                    <span id="status-text" style="font-size: 0.75rem; color: ${isViewed ? '#fff' : '#888'}; 
                            font-weight: ${isViewed ? 'bold' : 'normal'}; text-transform: uppercase; letter-spacing: 1px;">
                        ${isViewed ? 'Просмотрено' : 'Не просмотрено'}
                    </span>
                    <input type="hidden" id="edit-status" value="${m.status}">
                </div>

                <br>
                <button onclick='toggleEditMode()' style="font-size:0.6rem; background:none; border:1px solid #333; color:#555; cursor:pointer; padding:4px 8px; border-radius:4px; margin-top:10px;">
                    ${isEditMode ? 'ОТМЕНИТЬ ПРАВКУ' : 'ИЗМЕНИТЬ ДАННЫЕ'}
                </button>
            </div>
        </div>

        <div class="total-score-big" style="text-align: center;">
            <h2 id="total-val">${r.total.toFixed(1)}</h2>
        </div>

        <div style="display: flex; flex-direction: column; gap: 20px;">
            <div class="${currentUser !== 'me' ? 'locked-group' : ''}">
                <p style="text-align:center; font-size:0.7rem; color:#c0c0c0; text-transform:uppercase; margin-bottom:10px;">ОЦЕНКА УМНОГО: ${r.me.toFixed(1)}</p>
                ${renderSliders(m, 'me')}
            </div>
            <div style="border-top: 1px solid #222; padding-top: 20px;" class="${currentUser !== 'any' ? 'locked-group' : ''}">
                <p style="text-align:center; font-size:0.7rem; color:#c0c0c0; text-transform:uppercase; margin-bottom:10px;">ОЦЕНКА НЕ УМНОГО: ${r.any.toFixed(1)}</p>
                ${renderSliders(m, 'any')}
            </div>
        </div>

        <textarea id="review-common" placeholder="Общий комментарий..." style="margin-top:20px;">${m.review_common || ''}</textarea>
        <button onclick="saveRatings()" class="save-btn">СОХРАНИТЬ</button>
        <button onclick="deleteMovie()" style="background:none; color:#333; border:none; width:100%; margin-top:10px; cursor:pointer; font-size:0.7rem;">УДАЛИТЬ ФИЛЬМ</button>
        
        <div style="text-align:center; color:#333; font-size:0.6rem; margin-top:15px; text-transform:uppercase; letter-spacing:1px;">
            Последнее изменение: ${formatDate(dateToShow)}
        </div>
    `;
}

/**
 * Переключает статус просмотра фильма (Просмотрено/Не просмотрено)
 * Анимирует изменение UI элементов
 */
function toggleMovieStatus() {
    const statusInput = document.getElementById('edit-status');
    const statusIcon = document.getElementById('status-icon');
    const statusText = document.getElementById('status-text');
    const toggleBtn = document.getElementById('status-toggle');

    // Анимация иконки
    statusIcon.style.transform = 'rotate(360deg) scale(1.2)';
    setTimeout(() => { statusIcon.style.transform = 'rotate(0deg) scale(1)'; }, 300);

    if (statusInput.value === 'Просмотрено') {
        statusInput.value = 'Не просмотрено';
        statusIcon.innerText = '○';
        statusIcon.style.color = '#666';
        statusText.innerText = 'Не просмотрено';
        statusText.style.color = '#888';
        statusText.style.fontWeight = 'normal';
        toggleBtn.style.borderColor = '#444';
        toggleBtn.style.background = 'transparent';
        toggleBtn.style.boxShadow = 'none';
    } else {
        statusInput.value = 'Просмотрено';
        statusIcon.innerText = '✓';
        statusIcon.style.color = '#ccc';
        statusText.innerText = 'Просмотрено';
        statusText.style.color = '#fff';
        statusText.style.fontWeight = 'bold';
        toggleBtn.style.borderColor = '#ccc';
        toggleBtn.style.background = 'rgba(255, 255, 255, 0.08)';
        toggleBtn.style.boxShadow = '0 0 15px rgba(255, 255, 255, 0.05)';
    }
}

/**
 * Рендерит ползунки оценок для определенного пользователя
 * @param {object} m - Объект фильма
 * @param {string} role - Роль пользователя ('me' или 'any')
 * @returns {string} HTML с ползунками
 */
function renderSliders(m, role) {
    const isLocked = (role !== currentUser);
    const fields = ['plot', 'ending', 'reviewability', 'actors', 'atmosphere', 'music'];
    const labels = ['СЮЖЕТ', 'КОНЦОВКА', 'ПЕРЕСМ.', 'АКТЕРЫ', 'АТМОСФЕРА', 'ЗВУК'];
    
    return fields.map((f, i) => {
        const v = m[f + '_' + role] || 0;
        return `
            <div class="score-group" style="margin-bottom:12px; background: #111; padding: 10px; border-radius: 8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <span style="font-size:0.7rem; color:#777; letter-spacing:1px;">${labels[i]}</span>
                    <span id="val-${f}_${role}" style="font-weight:bold; color:#c0c0c0; font-size:0.9rem;">${v}</span>
                </div>
                <input type="range" min="0" max="10" step="1" value="${v}" 
                    ${isLocked ? 'disabled' : ''} 
                    style="width:100%;" 
                    oninput="document.getElementById('val-${f}_${role}').innerText=this.value; updateLiveRating();" 
                    id="input-${f}_${role}">
            </div>`;
    }).join('');
}

/**
 * Обновляет общий рейтинг в реальном времени при изменении ползунков
 */
function updateLiveRating() {
    const v = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    const weights = { plot: 0.40, end: 0.25, rev: 0.15, act: 0.10, atm: 0.05, mus: 0.05 };
    
    const getScore = (role) => {
        return v(`input-plot_${role}`)*weights.plot + 
               v(`input-ending_${role}`)*weights.end + 
               v(`input-reviewability_${role}`)*weights.rev + 
               v(`input-actors_${role}`)*weights.act + 
               v(`input-atmosphere_${role}`)*weights.atm + 
               v(`input-music_${role}`)*weights.mus;
    };
    
    const scoreMe = getScore('me');
    const scoreAny = getScore('any');
    document.getElementById('total-val').innerText = ((scoreMe + scoreAny) / 2).toFixed(1);
}

/**
 * Переключает режим редактирования данных фильма
 */
function toggleEditMode() { 
    isEditMode = !isEditMode; 
    const movie = allMovies.find(m => m.id == currentMovieId);
    renderModalContent(movie); 
}

// ==========================================
// 9. ДОБАВЛЕНИЕ НОВЫХ ФИЛЬМОВ
// ==========================================

/**
 * Переключает видимость формы добавления фильма
 */
function toggleForm() {
    const f = document.getElementById('form-container');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

/**
 * Ищет информацию о фильме в TMDB API и автоматически заполняет форму
 * Требует введения названия фильма
 */
async function searchMovieData() {
    const titleInput = document.getElementById('new-title');
    const title = titleInput.value;
    const searchBtn = document.querySelector('button[onclick="searchMovieData()"]');
    
    if (!title) return showToast("Введите название фильма", "warning");
    const originalBtnText = searchBtn.innerText;
    searchBtn.innerText = "ПОИСК...";
    searchBtn.style.opacity = "0.5";
    searchBtn.disabled = true;
    
    try {
        // Ищем фильм в TMDB
        const searchRes = await fetch(
            `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=ru-RU`
        );
        const searchData = await searchRes.json();
        
        if (searchData.results.length === 0) {
            return showToast("Фильм не найден в TMDB", "error");
        }
        
        // Получаем полную информацию о первом найденном фильме
        const details = await (
            await fetch(
                `https://api.themoviedb.org/3/movie/${searchData.results[0].id}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=ru-RU`
            )
        ).json();
        
        // Заполняем форму полученными данными
        document.getElementById('new-title').value = details.title;
        document.getElementById('new-poster').value = details.poster_path ? TMDB_IMAGE_BASE + details.poster_path : '';
        document.getElementById('new-year').value = details.release_date ? details.release_date.split('-')[0] : '';
        document.getElementById('new-duration').value = details.runtime || '';
        document.getElementById('new-genre').value = details.genres.map(g => g.name).join(', ');
        
        tempExternalRating = details.vote_average ? details.vote_average.toFixed(1) : '0.0';
        
        const director = details.credits.crew.find(person => person.job === 'Director');
        document.getElementById('new-producer').value = director ? director.name : '';
        document.getElementById('new-actors').value = details.credits.cast.slice(0, 3).map(a => a.name).join(', ');
        
        showToast(`Данные загружены! TMDB: ${tempExternalRating}`, "success");
    } catch (err) {
        showToast("Сбой при поиске в TMDB", "error");
    } finally {
        searchBtn.innerText = originalBtnText;
        searchBtn.style.opacity = "1";
        searchBtn.disabled = false;
    }
}

/**
 * Обработчик отправки формы добавления фильма
 * Создает новый фильм в базе данных
 */
document.getElementById('add-movie-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // === НОВАЯ ЛОГИКА: ПРОВЕРКА НА ДУБЛИКАТЫ ===
    const newTitle = document.getElementById('new-title').value.trim();
    
    // Ищем совпадения, игнорируя большие/маленькие буквы
    const isDuplicate = allMovies.some(m => m.title.toLowerCase() === newTitle.toLowerCase());
    
    if (isDuplicate) {
        showToast("ЭТОТ ФИЛЬМ УЖЕ ЕСТЬ В СПИСКЕ", "error"); // Показываем стильную ошибку с крестиком
        return; // Останавливаем выполнение кода, фильм не добавится
    }
    // ==========================================
    
    const newMovie = { 
        title: newTitle, // Используем уже очищенное от пробелов название
        poster: document.getElementById('new-poster').value,
        year: document.getElementById('new-year').value, 
        duration: parseInt(document.getElementById('new-duration').value) || 0,
        genre: document.getElementById('new-genre').value, 
        producer: document.getElementById('new-producer').value, 
        actors: document.getElementById('new-actors').value, 
        external_rating: tempExternalRating,
        kp_rating: document.getElementById('new-kp-rating') ? document.getElementById('new-kp-rating').value : null,
        status: document.getElementById('new-status').value, 
        updated_at: new Date().toISOString() 
    };
    
    await supabaseClient.from('movies').insert([newMovie]);
    location.reload();
});

// ==========================================
// 10. НАВИГАЦИЯ И ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
// ==========================================

/**
 * Переключает между вкладками (Фильмы, Рулетка, Статистика)
 * @param {string} tab - Название вкладки ('grid', 'roulette' или 'stats')
 */
function switchTab(tab) {
    const screens = ['main-view', 'stats-container', 'roulette-screen'];
    
    // Скрываем все экраны
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    // Удаляем класс active со всех кнопок
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // Показываем нужный экран и активируем кнопку
    const targetScreen = document.getElementById(tab === 'grid' ? 'main-view' : (tab === 'stats' ? 'stats-container' : 'roulette-screen'));
    const targetBtn = document.getElementById(`tab-${tab}`);
    
    if (targetScreen) targetScreen.style.display = 'block';
    if (targetBtn) targetBtn.classList.add('active');

    // Загружаем статистику при переходе на её вкладку
    if (tab === 'stats' && typeof generateStatistics === "function") {
        generateStatistics();
    }

    // Настраиваем рулетку при переходе на её вкладку
    if (tab === 'roulette') {
        const isMobile = window.innerWidth <= 600;
        
        if (isMobile) {
            if (typeof setupRouletteView === "function") {
                setupRouletteView();
            }
        } else {
            const mobileContainer = document.getElementById('mobile-roulette-container');
            const pcContainer = document.getElementById('roulette-container');
            const pcControls = document.getElementById('pc-spin-controls');
            
            if (mobileContainer) mobileContainer.style.display = 'none';
            if (pcContainer) pcContainer.style.display = 'block';
            if (pcControls) pcControls.style.display = 'block';
            
            if (typeof drawWheel === "function") drawWheel();
        }
    }
}

// ==========================================
// 11. СТАТИСТИКА
// ==========================================

/**
 * Генерирует и отображает статистику по всем просмотренным фильмам
 * Показывает средний рейтинг, жанры, топ лучших/худших фильмов и другие метрики
 */

function generateStatistics() {
    const container = document.getElementById('stats-container');
    const viewed = allMovies.filter(m => m.status === 'Просмотрено');
    
    if (!viewed.length) {
        container.innerHTML = "<p style='text-align:center; color:#555;'>Нет данных.</p>";
        return;
    }
    
    // БАЗОВЫЕ МЕТРИКИ
    const avgScore = (viewed.reduce((acc, m) => acc + calculateRating(m).total, 0) / viewed.length).toFixed(1);
    const totalMinutes = viewed.reduce((acc, m) => acc + (parseInt(m.duration) || 0), 0);
    const totalMoviesCount = viewed.length;
    
    const longest = viewed.reduce((p, c) => (parseInt(c.duration || 0) > parseInt(p.duration || 0)) ? c : p);
    const oldest = viewed.reduce((p, c) => (parseInt(c.year || 3000) < parseInt(p.year || 3000)) ? c : p);

    // ==========================================
    // СОВМЕСТИМОСТЬ ВКУСОВ 
    // ==========================================
    const bothRated = viewed.filter(m => {
        const hasMe = (Number(m.plot_me||0) + Number(m.ending_me||0) + Number(m.actors_me||0) + Number(m.reviewability_me||0) + Number(m.atmosphere_me||0) + Number(m.music_me||0)) > 0;
        const hasAny = (Number(m.plot_any||0) + Number(m.ending_any||0) + Number(m.actors_any||0) + Number(m.reviewability_any||0) + Number(m.atmosphere_any||0) + Number(m.music_any||0)) > 0;
        return hasMe && hasAny;
    });

    let matchHTML = "";
    
    if (bothRated.length > 0) {
        let totalDiff = 0;
        let sumMe = 0;
        let sumAny = 0;

        bothRated.forEach(m => {
            const r = calculateRating(m);
            sumMe += r.me;
            sumAny += r.any;
            totalDiff += Math.abs(r.me - r.any);
        });

        const count = bothRated.length;
        const avgDiff = totalDiff / count;
        
        let matchPercent = Math.round(100 - (avgDiff * 10));
        if (matchPercent < 0) matchPercent = 0;

        const avgMe = (sumMe / count).toFixed(2);
        const avgAny = (sumAny / count).toFixed(2);

        let verdict = "";
        const diffAvg = Math.abs(avgMe - avgAny).toFixed(2);
        if (avgMe > avgAny) verdict = `«Не умный» судит фильмы строже в среднем на ${diffAvg} балла.`;
        else if (avgAny > avgMe) verdict = `«Умный» судит фильмы строже в среднем на ${diffAvg} балла.`;
        else verdict = "В среднем вы оцениваете фильмы абсолютно одинаково.";

        const mostAgreed = bothRated.reduce((p, c) => Math.abs(calculateRating(c).me - calculateRating(c).any) < Math.abs(calculateRating(p).me - calculateRating(p).any) ? c : p);
        const mostDisagreed = bothRated.reduce((p, c) => Math.abs(calculateRating(c).me - calculateRating(c).any) > Math.abs(calculateRating(p).me - calculateRating(p).any) ? c : p);

        const agreedDiff = Math.abs(calculateRating(mostAgreed).me - calculateRating(mostAgreed).any).toFixed(2);
        const disagreedDiff = Math.abs(calculateRating(mostDisagreed).me - calculateRating(mostDisagreed).any).toFixed(2);

        matchHTML = `
        <div class="match-container">
            <h2 class="match-percent">${matchPercent}%</h2>
            <div class="match-label">СОВПАДЕНИЕ ВКУСОВ</div>

            <div class="match-stats">
                <div class="match-user">
                    <h4>Умный</h4>
                    <div class="match-score">${avgMe}</div>
                </div>
                <div class="match-user">
                    <h4>Не умный</h4>
                    <div class="match-score">${avgAny}</div>
                </div>
            </div>

            <div class="match-verdict">${verdict}</div>

            <div class="match-extremes">
                <div class="match-card">
                    <div class="match-card-title">🤝 Единогласие</div>
                    <div class="match-card-movie">${mostAgreed.title}</div>
                    <div class="match-card-diff">Разница: ${agreedDiff} балла</div>
                </div>
                <div class="match-card">
                    <div class="match-card-title">👾 Разногласие</div>
                    <div class="match-card-movie">${mostDisagreed.title}</div>
                    <div class="match-card-diff">Разница: ${disagreedDiff} балла</div>
                </div>
            </div>
        </div>`;

        // === НОВЫЙ КОД: РАСЧЕТ ДЛЯ ГРАФИКА-ПАУТИНЫ ===
        let sMe = { plot: 0, ending: 0, reviewability: 0, actors: 0, atmosphere: 0, music: 0 };
        let sAny = { plot: 0, ending: 0, reviewability: 0, actors: 0, atmosphere: 0, music: 0 };
        
        bothRated.forEach(m => {
            sMe.plot += Number(m.plot_me||0); sMe.ending += Number(m.ending_me||0); sMe.reviewability += Number(m.reviewability_me||0);
            sMe.actors += Number(m.actors_me||0); sMe.atmosphere += Number(m.atmosphere_me||0); sMe.music += Number(m.music_me||0);
            
            sAny.plot += Number(m.plot_any||0); sAny.ending += Number(m.ending_any||0); sAny.reviewability += Number(m.reviewability_any||0);
            sAny.actors += Number(m.actors_any||0); sAny.atmosphere += Number(m.atmosphere_any||0); sAny.music += Number(m.music_any||0);
        });
        
        // Делим на количество фильмов, чтобы получить среднее
        for(let k in sMe) sMe[k] /= count;
        for(let k in sAny) sAny[k] /= count;

        // Добавляем HTML-контейнер для графика
        matchHTML += `
        <div style="background:#161616; padding:20px; border-radius:15px; border:1px solid #2a2a2a; margin-bottom:30px; text-align:center;">
            <h3 style="font-size:0.7rem; color:#555; text-transform:uppercase; letter-spacing:2px; margin:0 0 20px 0;">ДЕТАЛЬНЫЙ РАЗБОР ВКУСОВ</h3>
            <div style="position:relative; width:100%; max-width:350px; margin:0 auto; aspect-ratio:1/1;">
                <canvas id="radarCanvas" style="width:100%; height:100%;"></canvas>
            </div>
            <div style="display:flex; justify-content:center; gap:10px; margin-top:15px;">
                <button onclick="setRadarView('me')" id="btn-radar-me" style="font-size:0.6rem; padding:5px 12px; border-radius:5px; border:1px solid #444; background:none; color:#888; cursor:pointer;">ТОЛЬКО Я</button>
                <button onclick="setRadarView('both')" id="btn-radar-both" style="font-size:0.6rem; padding:5px 12px; border-radius:5px; border:1px solid #c0c0c0; background:#c0c0c0; color:#000; cursor:pointer; font-weight:bold;">ОБА</button>
                <button onclick="setRadarView('any')" id="btn-radar-any" style="font-size:0.6rem; padding:5px 12px; border-radius:5px; border:1px solid #444; background:none; color:#888; cursor:pointer;">ТОЛЬКО ОН</button>
            </div>
        </div>`;
        
        // Сохраняем данные временно, чтобы нарисовать график после загрузки HTML
        window.radarData = { me: sMe, any: sAny };
        // ===============================================
    }

    // ==========================================
    // ЖАНРЫ И ТОПЫ (НОВЫЙ БЛОК С МЕДАЛЯМИ)
    // ==========================================
    
    const genreData = {};
    viewed.forEach(m => {
        if (m.genre) {
            m.genre.split(',').forEach(g => {
                const name = g.trim().toUpperCase(); // Приводим к верхнему регистру для точной группировки
                if (!genreData[name]) genreData[name] = { count: 0, totalScore: 0 };
                genreData[name].count++;
                genreData[name].totalScore += calculateRating(m).total;
            });
        }
    });

    // Оставляем только ТОП-10 жанров
    const sortedGenres = Object.entries(genreData)
        .map(([name, data]) => ({
            name,
            count: data.count,
            avg: data.totalScore / data.count,
            score: (data.totalScore / data.count) * (1 + Math.log10(data.count))
        }))
        .sort((a, b) => b.score - a.score);

    // Ищем максимальный балл для 100% полоски
    const maxScore = sortedGenres.length > 0 ? sortedGenres[0].score : 1;

    // Генерируем HTML полосок
    const genreBarsHTML = sortedGenres.map((g, index) => {
        const relativeWidth = (g.score / maxScore) * 100;
        
        let medalClass = "";
        if (index === 0) medalClass = "bar-gold";
        else if (index === 1) medalClass = "bar-silver";
        else if (index === 2) medalClass = "bar-bronze";

        return `
            <div class="genre-item">
                <div class="genre-name" style="${index < 3 ? 'color: #fff; font-weight: bold;' : ''}">
                    ${g.name}
                </div>
                <div class="genre-track">
                    <div class="genre-fill ${medalClass}" style="width: ${relativeWidth}%"></div>
                </div>
                <div class="genre-info">
                    <span style="color: #eee;">${g.avg.toFixed(1)} ★</span> 
                    <span style="color: #444; font-size: 0.6rem;">(${g.count})</span>
                </div>
            </div>
        `;
    }).join('');

    const renderMiniList = (movies, label, isBest = false) => `
        <div style="background:#161616; padding:20px; border-radius:15px; border:1px solid #2a2a2a; height: 100%;">
            <h3 style="font-size:0.7rem; color:#555; text-transform:uppercase; letter-spacing:2px; margin:0 0 15px 0;">${label}</h3>
            ${movies.map((m, i) => {
                let bS = "background: #2a2a2a; color: #fff;"; 
                if (isBest && i === 0) bS = "background: linear-gradient(145deg, #bf953f, #fcf6ba, #b38728); color: #000;";
                else if (isBest && i === 1) bS = "background: linear-gradient(145deg, #959595, #ffffff, #707070); color: #000;";
                else if (isBest && i === 2) bS = "background: linear-gradient(145deg, #804a00, #ecaa7e, #a45d10); color: #fff;";
                return `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; font-size:0.85rem;">
                    <span style="color:#555; font-weight:bold; width:15px;">${i+1}.</span>
                    <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin:0 10px;">${m.title}</span>
                    <span style="${bS} padding:3px 8px; border-radius:6px; font-weight:900; font-size:0.75rem;">${calculateRating(m).total.toFixed(1)}</span>
                </div>`;
            }).join('')}
        </div>`;

    container.innerHTML = `
        <h3 class="stats-group-title">ОБЩАЯ СТАТИСТИКА</h3>
        <div class="stats-grid-main">
            <div style="background:#161616; padding:15px; border-radius:20px; text-align:center; border:1px solid #2a2a2a;">
                <p style="color:#555; font-size:0.6rem; margin:0;">ФИЛЬМОВ</p>
                <h2 style="font-size:1.8rem; margin:5px 0;">${totalMoviesCount}</h2>
            </div>
            <div style="background:#161616; padding:15px; border-radius:20px; text-align:center; border:1px solid #2a2a2a;">
                <p style="color:#555; font-size:0.6rem; margin:0;">СРЕДНИЙ БАЛЛ</p>
                <h2 style="font-size:1.8rem; margin:5px 0;">${avgScore}</h2>
            </div>
            <div style="background:#161616; padding:15px; border-radius:20px; text-align:center; border:1px solid #2a2a2a;">
                <p style="color:#555; font-size:0.6rem; margin:0;">ВРЕМЯ В КИНО</p>
                <h2 style="font-size:1.8rem; margin:5px 0;">${Math.floor(totalMinutes/60)}<span style="font-size:0.8rem;">ч</span> ${totalMinutes%60}<span style="font-size:0.8rem;">м</span></h2>
            </div>
        </div>

        ${matchHTML}

        <h3 class="stats-group-title">ИНТЕРЕСНО, ЧТО...</h3>
        <div class="stats-grid-records">
            <div class="record-card">
                <p style="font-size:0.55rem; color:#555; margin:0 0 8px 0;">САМЫЙ ДОЛГИЙ</p>
                <div style="font-size:0.85rem;">${longest.title}</div>
                <span>${longest.duration || 0} мин</span>
            </div>
            <div class="record-card">
                <p style="font-size:0.55rem; color:#555; margin:0 0 8px 0;">САМЫЙ СТАРЫЙ</p>
                <div style="font-size:0.85rem;">${oldest.title}</div>
                <span>${oldest.year || '—'} год</span>
            </div>
            <div class="record-card">
                <p style="font-size:0.55rem; color:#555; margin:0 0 8px 0;">ЛЮБИМЫЙ ЖАНР</p>
                <div style="font-size:0.85rem;">${sortedGenres.length ? sortedGenres[0].name : '—'}</div>
                <span>Ср. балл: ${sortedGenres.length ? sortedGenres[0].avg.toFixed(1) : '—'}</span>
            </div>
        </div>

        <h3 class="stats-group-title">РЕЙТИНГ ЖАНРОВ</h3>
        <div class="genre-bar-container">
            ${genreBarsHTML}
        </div>

        <div class="stats-grid-tops">
            ${renderMiniList([...viewed].sort((a,b)=>calculateRating(b).total-calculateRating(a).total).slice(0,5), "🔥 ТОП ЛУЧШИХ", true)}
            ${renderMiniList([...viewed].sort((a,b)=>calculateRating(a).total-calculateRating(b).total).slice(0,5), "💀 ТОП ХУДШИХ", false)}
        </div>`;

        // Запускаем рисование радара, если для него есть данные
    if (bothRated.length > 0 && window.radarData) {
        drawRadarChart(window.radarData.me, window.radarData.any);
    }
}

/**
 * Отрисовывает график-паутину (радар) в статистике
 */
function drawRadarChart(statsMe, statsAny) {
    const canvas = document.getElementById('radarCanvas');
    if (!canvas) return;

    // Настраиваем качество для Retina-дисплеев
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const radius = Math.min(centerX, centerY) - 35; // Отступ для текста

    const labels = ['СЮЖЕТ', 'КОНЦОВКА', 'ПЕРЕСМ.', 'АКТЕРЫ', 'АТМ.', 'ЗВУК'];
    const keys = ['plot', 'ending', 'reviewability', 'actors', 'atmosphere', 'music'];
    const angleStep = (Math.PI * 2) / 6;

    // 1. Рисуем сетку (паутину) из 5 уровней (оценки 2, 4, 6, 8, 10)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 9px "Segoe UI", sans-serif';

    for (let level = 1; level <= 5; level++) {
        const r = radius * (level / 5);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = i * angleStep - Math.PI / 2; // -90 градусов, чтобы вершина была сверху
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.stroke();
    }

    // 2. Рисуем оси от центра и подписи критериев
    for (let i = 0; i < 6; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.stroke();

        // Подписи
        const labelX = centerX + Math.cos(angle) * (radius + 20);
        const labelY = centerY + Math.sin(angle) * (radius + 15);
        ctx.fillStyle = '#888';
        ctx.fillText(labels[i], labelX, labelY);
    }

    // 3. Функция отрисовки слоя данных
    function drawPolygon(data, fillStyle, strokeStyle, isDashed) {
        ctx.beginPath();
        keys.forEach((key, i) => {
            const r = radius * (data[key] / 10); // Масштабируем оценку от 0 до 10
            const angle = i * angleStep - Math.PI / 2;
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        
        ctx.fillStyle = fillStyle;
        ctx.fill();
        
        if (isDashed) ctx.setLineDash([4, 4]); // Пунктир для "Не умного"
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]); // Сбрасываем пунктир
    }

    // Рисуем данные в зависимости от выбранного режима
    if (currentRadarView === 'any' || currentRadarView === 'both') {
        drawPolygon(statsAny, 'rgba(50, 50, 50, 0.4)', 'rgba(136, 136, 136, 0.8)', true);
    }
    
    if (currentRadarView === 'me' || currentRadarView === 'both') {
        drawPolygon(statsMe, 'rgba(192, 192, 192, 0.3)', 'rgba(255, 255, 255, 0.9)', false);
    }
}

// ==========================================
// 12. РУЛЕТКА - ВЫБОР ФИЛЬМА
// ==========================================
let eliminationAnim = { active: false, index: -1, progress: 0 };

let idleSpinId = null;
let isIdleSpinning = false;

// Функция медленного вращения в фоне
function startIdleSpin() {
    if (isIdleSpinning) return;
    isIdleSpinning = true;
    
    function idleLoop() {
        if (!isIdleSpinning) return;
        wheelAngle -= 0.004; // Отрицательное значение крутит ПРОТИВ часовой стрелки
        if (wheelAngle < 0) wheelAngle += Math.PI * 2;
        drawWheel();
        idleSpinId = requestAnimationFrame(idleLoop);
    }
    idleLoop();
}

// Функция остановки фонового вращения
function stopIdleSpin() {
    isIdleSpinning = false;
    if (idleSpinId) cancelAnimationFrame(idleSpinId);
}
/**
 * Инициализирует рулетку, подготавливая список фильмов
 * Фильтрует фильмы по времени просмотра и статусу
 */
function initRoulette() {
    if (isSpinning) return;
    
    const maxTime = parseInt(document.getElementById('time-filter').value) || 999;
    
    currentRouletteMovies = allMovies.filter(m => 
        m.status === 'Не просмотрено' && 
        (parseInt(m.duration) || 0) <= maxTime
    );

    if (currentRouletteMovies.length < 2) {
        showToast("Добавьте минимум 2 фильма в 'Не просмотрено'!", "warning");
        return;
    }

    localStorage.setItem('roulette_session', JSON.stringify(currentRouletteMovies));
    
    const spinBtn = document.getElementById('spin-button');
    spinBtn.disabled = false;
    spinBtn.style.opacity = "1";
    spinBtn.style.cursor = "pointer";
    
    document.getElementById('winner-display').innerText = `Список готов: ${currentRouletteMovies.length} поз.`;
    wheelAngle = 0; 
    startIdleSpin(); // Запускаем фоновое вращение вместо обычной статичной отрисовки
}

/**
 * Настраивает вид рулетки в зависимости от устройства (мобильное/ПК)
 */
function setupRouletteView() {
    const isMobile = window.innerWidth <= 600;
    
    if (isMobile) {
        document.getElementById('roulette-container').style.display = 'none';
        document.getElementById('pc-spin-controls').style.display = 'none';
        document.getElementById('mobile-roulette-container').style.display = 'block';
        prepareDrum();
    } else {
        document.getElementById('roulette-container').style.display = 'block';
        document.getElementById('pc-spin-controls').style.display = 'block';
        document.getElementById('mobile-roulette-container').style.display = 'none';
        
        if (typeof drawWheel === "function") drawWheel();
    }
}

/**
 * Рисует колесо рулетки с названиями фильмов
 * Адаптируется под размер экрана
 */
function drawWheel() {
    if (window.innerWidth <= 600) return; 

    const canvas = document.getElementById('wheelCanvas');
    if (!canvas || currentRouletteMovies.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.parentElement.offsetWidth;
    
    if (canvas.width !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);
    }

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 30; 
    const sliceAngle = (2 * Math.PI) / currentRouletteMovies.length;

    ctx.clearRect(0, 0, size, size);

    renderSectors(ctx, centerX, centerY, radius, sliceAngle, wheelAngle, 1);
}

/**
 * Вспомогательная функция для отрисовки секторов колеса
 * @param {CanvasRenderingContext2D} ctx - Контекст canvas
 * @param {number} centerX - X координата центра
 * @param {number} centerY - Y координата центра
 * @param {number} radius - Радиус колеса
 * @param {number} sliceAngle - Угол каждого сектора
 * @param {number} angleOffset - Смещение угла при вращении
 * @param {number} opacity - Прозрачность (для эффектов)
 */

function renderSectors(ctx, centerX, centerY, radius, sliceAngle, angleOffset, opacity) {
    // Градиент для линий
    const lineGradient = ctx.createRadialGradient(centerX, centerY, radius * 0.2, centerX, centerY, radius);
    lineGradient.addColorStop(0, 'rgba(192, 192, 192, 0)');
    lineGradient.addColorStop(1, 'rgba(192, 192, 192, 0.25)');

    // === НОВЫЙ КОД: ПОИСК БЛИЖАЙШЕГО СЕКТОРА К ЦЕНТРУ ЛИНЗЫ ===
    let closestIndex = -1;
    let minDistance = Infinity;

    currentRouletteMovies.forEach((_, i) => {
        const angle = angleOffset + i * sliceAngle;
        const midAngle = angle + sliceAngle / 2;
        let normMid = midAngle % (Math.PI * 2);
        if (normMid < 0) normMid += Math.PI * 2;
        const dist = Math.min(normMid, Math.PI * 2 - normMid);

        if (dist < minDistance) {
            minDistance = dist;
            closestIndex = i; // Запоминаем индекс фильма, который ближе всего к центру
        }
    });

    currentRouletteMovies.forEach((movie, i) => {
        const angle = angleOffset + i * sliceAngle;
        const midAngle = angle + sliceAngle / 2;
        
        ctx.save(); // ЗАЩИЩАЕМ координаты колеса от сдвигов анимации

        let currentOpacity = opacity;

        // Логика анимации вылета (если этот фильм выбывает)
        if (eliminationAnim.active && i === eliminationAnim.index) {
            ctx.translate(eliminationAnim.progress * 250, 0); // Летим вправо в линзу
            currentOpacity = opacity * (1 - eliminationAnim.progress); // Растворяемся
        }

        ctx.globalAlpha = currentOpacity;
        
        // Рисуем сам сектор
        ctx.fillStyle = (i % 2 === 0) ? `rgba(255, 255, 255, 0.02)` : `rgba(255, 255, 255, 0.015)`;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, angle, angle + sliceAngle);
        ctx.fill();

        // Рисуем линии секторов
        ctx.strokeStyle = lineGradient;
        ctx.lineWidth = 1;
        ctx.stroke();

        // --- ЛОГИКА ЭФФЕКТА ЛУПЫ ---
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(midAngle);
        ctx.textAlign = "right";
        
        let normMid = midAngle % (Math.PI * 2);
        if (normMid < 0) normMid += Math.PI * 2;
        const distanceToLens = Math.min(normMid, Math.PI * 2 - normMid);
        
        const isActive = (i === closestIndex) && (distanceToLens < 0.2);

        if (isActive) {
            // ИСПРАВЛЕНИЕ СКАЧКА: Увеличиваем размер шрифта, а не масштаб Canvas!
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
            ctx.fillStyle = `rgba(255, 255, 255, ${currentOpacity})`;
            ctx.font = `800 ${Math.max(14, radius / 18)}px 'Segoe UI', sans-serif`; 
        } else {
            ctx.shadowBlur = 0; 
            ctx.fillStyle = `rgba(140, 140, 140, ${currentOpacity})`;
            ctx.font = `500 ${Math.max(11, radius / 26)}px 'Segoe UI', sans-serif`;
        }

        const shortTitle = movie.title.length > 22 ? movie.title.substring(0, 19) + '...' : movie.title;
        ctx.fillText(shortTitle, radius - 35, 5);
        ctx.restore();

        ctx.restore(); // Возвращаем координаты на место для следующего сектора
    });

    // --- РИСУЕМ ЧЕТКУЮ ДЫРКУ В ЦЕНТРЕ ---
    ctx.beginPath();
    ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a0a'; // Закрашиваем центр точно цветом фона сайта
    ctx.fill();

    // Рисуем серебряный ободок вокруг дырки
    ctx.beginPath();
    ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(192, 192, 192, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

/**
 * Запускает вращение колеса рулетки
 * Использует плавную анимацию и выбирает случайный фильм
 */
function spinRoulette() {
    if (isSpinning || currentRouletteMovies.length < 2) return;

    stopIdleSpin(); // Останавливаем фон перед основным броском

    isSpinning = true;
    const duration = (parseFloat(document.getElementById('spin-duration-input').value) || 5) * 1000;
    const startAngle = wheelAngle;
    // === НОВАЯ ЛОГИКА ИДЕАЛЬНОЙ ЦЕНТРОВКИ ===
        const sliceAngle = (2 * Math.PI) / currentRouletteMovies.length;
        
        // 1. Случайным образом выбираем индекс победителя заранее
        const winningIndex = Math.floor(Math.random() * currentRouletteMovies.length);
        
        // 2. Рассчитываем идеальный угол, при котором центр сектора победителя будет ровно под линзой (на 3 часа)
        let idealRemainder = (2 * Math.PI - (winningIndex * sliceAngle + sliceAngle / 2)) % (2 * Math.PI);
        if (idealRemainder < 0) idealRemainder += 2 * Math.PI; // Защита от отрицательных значений
        
        // 3. Формируем финальный угол: текущий оборот + 8-12 дополнительных кругов + идеальный угол
        const extraSpins = 8 + Math.floor(Math.random() * 5);
        const currentBase = Math.floor(startAngle / (2 * Math.PI)) * 2 * Math.PI;
        const targetAngle = currentBase + (extraSpins * 2 * Math.PI) + idealRemainder;
        // =========================================
        
        let startTime = null;

    function animate(currentTime) {
        if (!startTime) startTime = currentTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Стандартное замедление в конце
        const easing = 1 - Math.pow(1 - progress, 4);
        
        // Базовый расчет угла
        const baseAngle = startAngle + (targetAngle - startAngle) * easing;
        
        // ЭФФЕКТ МИКРО-ОСТАНОВКИ: добавляем легкое "сопротивление" на границах секторов
        const tickOffset = Math.sin((baseAngle % sliceAngle) / sliceAngle * Math.PI * 2) * 0.025;
        
        const oldAngle = wheelAngle;
        // Применяем сопротивление к итоговому углу
        wheelAngle = baseAngle - tickOffset;
        
        const delta = wheelAngle - oldAngle;

        // Воспроизведение звука при пересечении сектора
        const currentSector = Math.floor((1.5 * Math.PI - wheelAngle) / sliceAngle);
        const lastSector = Math.floor((1.5 * Math.PI - oldAngle) / sliceAngle);
        
        if (currentSector !== lastSector) {
            playTickSound();
        }

        const canvas = document.getElementById('wheelCanvas');
        const ctx = canvas.getContext('2d');
        const size = canvas.parentElement.offsetWidth;
        ctx.clearRect(0, 0, size, size);

        // Рисуем шлейф от скорости
        if (delta > 0.05) {
            renderSectors(ctx, size/2, size/2, size/2 - 30, sliceAngle, wheelAngle - delta * 0.5, 0.4);
        }
        // Рисуем основное колесо
        renderSectors(ctx, size/2, size/2, size/2 - 30, sliceAngle, wheelAngle, 1);

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            drawWheel(); 
            finalizeSpin();
        }
    }
    requestAnimationFrame(animate);
}

/**
 * Завершает спин рулетки и показывает результат
 * Обрабатывает режимы "На выбывание" и "Обычный"
 */
function finalizeSpin() {
    isSpinning = false;
    const sliceAngle = (2 * Math.PI) / currentRouletteMovies.length;
    const normalizedAngle = (2 * Math.PI - (wheelAngle % (2 * Math.PI))) % (2 * Math.PI);
    let winningIndex = Math.floor(normalizedAngle / sliceAngle);
    
    if (winningIndex >= currentRouletteMovies.length) winningIndex = currentRouletteMovies.length - 1;
    
    const winner = currentRouletteMovies[winningIndex];
    const display = document.getElementById('winner-display');
    const mode = document.getElementById('spin-mode').value;

    // Функция для показа оверлея с выигравшим фильмом
    const showWinnerOverlay = (header, title) => {
        const overlay = document.getElementById('winner-overlay');
        document.querySelector('#winner-overlay span').innerText = header;
        document.getElementById('overlay-movie-title').innerText = title;
        
        overlay.style.display = 'flex';
        overlay.style.pointerEvents = 'auto'; 
        setTimeout(() => overlay.style.opacity = '1', 10);
        triggerWinAnimation();
    };

    if (mode === 'elimination') {
        // Запускаем звук испарения
        playFadeSound();
        
        let startAnimTime = null;
        const animDuration = 700; // 0.7 секунд на вылет и испарение

        function animateOut(currentTime) {
            if (!startAnimTime) startAnimTime = currentTime;
            const progress = Math.min((currentTime - startAnimTime) / animDuration, 1);

            // Активируем переменные для renderSectors
            eliminationAnim.active = true;
            eliminationAnim.index = winningIndex;
            // Делаем плавное ускорение (ease-in) для красивого вылета
            eliminationAnim.progress = progress * progress; 

            startIdleSpin(); // Снова запускаем фоновое вращение, так как ждем следующего броска

            if (progress < 1) {
                requestAnimationFrame(animateOut);
            } else {
                // АНИМАЦИЯ ОКОНЧЕНА - Делаем резкое смыкание (Вариант А)
                eliminationAnim.active = false;
                currentRouletteMovies.splice(winningIndex, 1);
                localStorage.setItem('roulette_session', JSON.stringify(currentRouletteMovies));
                
                drawWheel(); // Моментально перерисовываем колесо без этого фильма

                if (currentRouletteMovies.length > 1) {
                    display.innerText = `ВЫБЫЛ: ${winner.title}`;
                    display.style.color = "#c0c0c0"; // Меняем на серебро
                    display.style.textShadow = "0 0 10px rgba(192, 192, 192, 0.5)"; // Добавляем сияние
                } else if (currentRouletteMovies.length === 1) {
                    const finalWinner = currentRouletteMovies[0];
                    display.innerText = `ПОБЕДИТЕЛЬ: ${finalWinner.title}`;
                    display.style.color = "#fff";
                    setTimeout(() => {
                        showWinnerOverlay("ВЫИГРАЛ ФИЛЬМ:", finalWinner.title);
                    }, 400); 
                }
            }
        }
        requestAnimationFrame(animateOut);
        
    } else {
        // Обычный режим — сразу показываем результат
        display.innerText = `ВЫБРАНО: ${winner.title}`;
        display.style.color = "#fff";
        showWinnerOverlay("ВЫИГРАЛ ФИЛЬМ:", winner.title);
    }
}

// ==========================================
// 12.1 МОБИЛЬНАЯ РУЛЕТКА (СВАЙП И ВРАЩЕНИЕ)
// ==========================================

let currentTranslateY = 0;
let dragStartY = 0;
let isDraggingDrum = false;
let lastDragTime = 0;
let swipeVelocity = 0;
let lastTickIndex = -1;

function prepareDrum() {
    const drumList = document.getElementById('drum-list');
    if (!drumList) return;

    const maxTime = parseInt(document.getElementById('time-filter').value) || 999;
    currentRouletteMovies = allMovies.filter(m => m.status === 'Не просмотрено' && (parseInt(m.duration) || 0) <= maxTime);

    drumList.innerHTML = '';
    currentTranslateY = 0;
    
    if (currentRouletteMovies.length < 2) {
        drumList.innerHTML = '<div class="drum-item" style="color:#ff4d4d; top:50%; transform:translateY(-50%);">НУЖНО 2 ФИЛЬМА</div>';
        return;
    }

    currentRouletteMovies.forEach((m, i) => {
        const item = document.createElement('div');
        item.className = 'drum-item';
        item.innerText = m.title;
        drumList.appendChild(item);
    });

    updateDrum3D();

    const wrapper = document.querySelector('.drum-wrapper');
    wrapper.replaceWith(wrapper.cloneNode(true));
    const newWrapper = document.querySelector('.drum-wrapper');

    newWrapper.addEventListener('touchstart', handleDrumTouchStart, {passive: false});
    newWrapper.addEventListener('touchmove', handleDrumTouchMove, {passive: false});
    newWrapper.addEventListener('touchend', handleDrumTouchEnd);
}

/**
 * Главная функция 3D трансформации (Идеальное фиксированное расстояние)
 */
function updateDrum3D() {
    const items = document.querySelectorAll('.drum-item');
    const radius = 160; 
    const anglePerItem = 20; 
    const totalDegrees = items.length * anglePerItem;
    const anglePerPixel = 0.4; 
    const currentAngle = currentTranslateY * anglePerPixel;

    items.forEach((item, i) => {
        const itemAngle = (i * anglePerItem) + currentAngle;
        let wrappedAngle = ((itemAngle % totalDegrees) + totalDegrees) % totalDegrees;
        if (wrappedAngle > totalDegrees / 2) {
            wrappedAngle -= totalDegrees;
        }

        if (Math.abs(wrappedAngle) > 85) {
            item.style.opacity = 0;
            item.style.transform = `rotateX(${wrappedAngle}deg) translateZ(${radius}px)`;
            item.classList.remove('active');
            return;
        }

        item.style.transform = `rotateX(${wrappedAngle}deg) translateZ(${radius}px)`;
        const opacity = Math.max(0, 1 - (Math.abs(wrappedAngle) / 70));
        
        // ЛОГИКА ЩЕЛЧКА
        if (Math.abs(wrappedAngle) < (anglePerItem / 2)) {
            item.classList.add('active');
            item.style.opacity = 1;
            
            // Если этот элемент только что стал активным — щелкаем
            if (lastTickIndex !== i) {
                playTickSound(); // Звук теперь вызывается только при смене индекса
                lastTickIndex = i;
                if (window.navigator.vibrate) window.navigator.vibrate(5); // Легкая вибрация для тактильности
            }
        } else {
            item.classList.remove('active');
            item.style.opacity = opacity;
        }
    });
}

function handleDrumTouchStart(e) {
    if (isSpinning || currentRouletteMovies.length < 2) return;
    isDraggingDrum = true;
    dragStartY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    lastDragTime = Date.now();
    swipeVelocity = 0;
}

function handleDrumTouchMove(e) {
    if (!isDraggingDrum || isSpinning) return;
    e.preventDefault();

    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - dragStartY;
    dragStartY = clientY;

    const now = Date.now();
    const deltaTime = now - lastDragTime;
    lastDragTime = now;
    if (deltaTime > 0) swipeVelocity = deltaY / deltaTime;

    currentTranslateY -= deltaY;
    updateDrum3D();
}

function handleDrumTouchEnd() {
    if (!isDraggingDrum || isSpinning) return;
    isDraggingDrum = false;
    isSpinning = true;
    
    // 1. Увеличиваем начальный импульс (было 16, сделаем 24 для большей дальности)
    let velocity = -swipeVelocity * 1.5; 
    const pixelsPerItem = 20 / 0.4;

    function step() {
        if (Math.abs(velocity) > 0.05) {
            currentTranslateY += velocity * 16;
            
            // 2. Уменьшаем трение (было 0.96, ставим 0.985)
            // Чем ближе к 1.0, тем дольше будет крутиться барабан
            velocity *= 0.985; 
            
            updateDrum3D();
            requestAnimationFrame(step);
        } else {
            // Магнитный довод до ближайшего фильма
            const targetY = Math.round(currentTranslateY / pixelsPerItem) * pixelsPerItem;
            const startTime = performance.now();
            const startY = currentTranslateY;

            function snap(now) {
                const progress = Math.min((now - startTime) / 500, 1); // Чуть замедлим финальный "довод"
                currentTranslateY = startY + (targetY - startY) * progress;
                updateDrum3D();
                if (progress < 1) requestAnimationFrame(snap);
                else finishSpin();
            }
            requestAnimationFrame(snap);
        }
    }
    requestAnimationFrame(step);
}

/**
 * Автоматическое вращение по кнопке "КРУТИТЬ БАРАБАН"
 */
function spinDrum() {
    if (isSpinning || currentRouletteMovies.length < 2) return;
    isSpinning = true;
    
    const extraSpins = 4 + Math.floor(Math.random() * 3); // 4-6 полных кругов
    const randomIndex = Math.floor(Math.random() * currentRouletteMovies.length);
    const pixelsPerItem = 20 / 0.4;
    const totalPixels = currentRouletteMovies.length * pixelsPerItem;
    
    const targetY = -(randomIndex * pixelsPerItem) - (extraSpins * totalPixels);
    const startY = currentTranslateY;
    const startTime = performance.now();
    const duration = 3500; 

    function animate(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 4); 
        
        currentTranslateY = startY + (targetY - startY) * easeOut;
        updateDrum3D();
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            finishSpin();
        }
    }
    requestAnimationFrame(animate);
}

function finishSpin() {
    isSpinning = false;
    const pixelsPerItem = 20 / 0.4;
    let index = Math.round(-currentTranslateY / pixelsPerItem) % currentRouletteMovies.length;
    if (index < 0) index += currentRouletteMovies.length;
    
    finalizeMobileSpin(index);
}

function finalizeMobileSpin(winningIndex) {
    if (!currentRouletteMovies || !currentRouletteMovies[winningIndex]) return;

    const winner = currentRouletteMovies[winningIndex];
    const modeSelect = document.getElementById('spin-mode');
    const mode = modeSelect ? modeSelect.value : 'classic';

    const overlay = document.getElementById('winner-overlay');
    const overlayTitle = document.getElementById('overlay-movie-title');
    const overlayHeader = document.querySelector('#winner-overlay span');

    if (!overlay || !overlayTitle) return;

    if (mode === 'elimination') {
        currentRouletteMovies.splice(winningIndex, 1);
        if (currentRouletteMovies.length === 1) {
            const finalWinner = currentRouletteMovies[0];
            setTimeout(() => {
                overlayHeader.innerText = "ФИНАЛЬНЫЙ ПОБЕДИТЕЛЬ:";
                overlayTitle.innerText = finalWinner.title;
                overlay.style.display = 'flex';
                overlay.style.pointerEvents = 'auto'; 
                setTimeout(() => overlay.style.opacity = '1', 50);
                if (typeof triggerWinAnimation === "function") triggerWinAnimation();
            }, 1000); 
        } else {
            setTimeout(() => {
                overlayHeader.innerText = "ВЫБЫЛ ФИЛЬМ:";
                overlayTitle.innerText = winner.title;
                overlay.style.display = 'flex';
                overlay.style.pointerEvents = 'auto'; 
                setTimeout(() => overlay.style.opacity = '1', 50);
                prepareDrum();
            }, 500);
        }
    } else {
        setTimeout(() => {
            overlayHeader.innerText = "ВЫПАЛ ФИЛЬМ:";
            overlayTitle.innerText = winner.title;
            overlay.style.display = 'flex';
            overlay.style.pointerEvents = 'auto'; 
            setTimeout(() => overlay.style.opacity = '1', 50);
            if (typeof triggerWinAnimation === "function") triggerWinAnimation();
        }, 500);
    }
}


// ==========================================
// 13. ЗВУКИ И ВИЗУАЛЬНЫЕ ЭФФЕКТЫ
// ==========================================

// Создаем единый аудио-контекст для всего приложения (Singleton)
let globalAudioCtx = null;
function getAudioContext() {
    if (!globalAudioCtx) {
        globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // В некоторых браузерах звук "засыпает", если нет активности
    if (globalAudioCtx.state === 'suspended') {
        globalAudioCtx.resume();
    }
    return globalAudioCtx;
}

/**
 * Воспроизводит звук трещотки (клик) при вращении
 */
function playTickSound() {
    const actx = getAudioContext();
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    
    osc.type = 'sine'; // Более мягкий звук
    osc.frequency.setValueAtTime(150, actx.currentTime); // Низкая частота (басовитый щелчок)
    osc.frequency.exponentialRampToValueAtTime(40, actx.currentTime + 0.03); 
    
    gain.gain.setValueAtTime(0.1, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.03);
    
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start();
    osc.stop(actx.currentTime + 0.03);
}

/**
 * Воспроизводит звук "улетающего ветра" (очень тихий и мягкий)
 */
function playFadeSound() {
    const actx = getAudioContext();
    const duration = 1.0; 
    const bufferSize = actx.sampleRate * duration;
    const buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Генерируем базовый шум
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1; 
    }

    const noise = actx.createBufferSource();
    noise.buffer = buffer;

    const filter = actx.createBiquadFilter();
    filter.type = 'lowpass';
    
    // Имитация порыва ветра
    filter.frequency.setValueAtTime(100, actx.currentTime);
    filter.frequency.linearRampToValueAtTime(800, actx.currentTime + 0.3); 
    filter.frequency.exponentialRampToValueAtTime(100, actx.currentTime + duration); 

    const gain = actx.createGain();
    
    // ДЕЛАЕМ ЗВУК НАМНОГО ТИШЕ: Пиковая громкость теперь всего 0.03 (вместо 0.15)
    gain.gain.setValueAtTime(0.001, actx.currentTime); 
    gain.gain.linearRampToValueAtTime(0.03, actx.currentTime + 0.3); // Пик громкости стал еле заметным
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + duration); 

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(actx.destination);
    
    noise.start();
}

/**
 * Звук победы (перезвон)
 */
function triggerWinAnimation() {
    const actx = getAudioContext();
    [880, 1108, 1318, 1760].forEach((freq, i) => {
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, actx.currentTime + i * 0.1);
        gain.gain.setValueAtTime(0.05, actx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, actx.currentTime + i * 0.1 + 1);
        osc.connect(gain);
        gain.connect(actx.destination);
        osc.start(actx.currentTime + i * 0.1);
        osc.stop(actx.currentTime + i * 0.1 + 1);
    });
}

/**
 * Закрывает оверлей с результатом победителя
 */
function closeWinnerOverlay() {
    const overlay = document.getElementById('winner-overlay');
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'none'; // Защита от случайных кликов
    }, 500);
}

// ==========================================
// 14. СОБЫТИЯ И ИНИЦИАЛИЗАЦИЯ
// ==========================================

/**
 * Обновляет размер колеса при изменении размера окна
 */
window.addEventListener('resize', drawWheel);

// Инициализация при загрузке страницы
checkAuth();

/**
 * Переключает режим видимости графиков
 */
function setRadarView(mode) {
    currentRadarView = mode;
    
    // Сбрасываем стили всех кнопок
    ['me', 'any', 'both'].forEach(m => {
        const btn = document.getElementById(`btn-radar-${m}`);
        if (btn) {
            btn.style.background = 'none';
            btn.style.color = '#888';
            btn.style.borderColor = '#444';
            btn.style.fontWeight = 'normal';
        }
    });

    // Активируем выбранную кнопку
    const activeBtn = document.getElementById(`btn-radar-${mode}`);
    if (activeBtn) {
        activeBtn.style.background = mode === 'both' ? '#c0c0c0' : 'rgba(255,255,255,0.1)';
        activeBtn.style.color = mode === 'both' ? '#000' : '#fff';
        activeBtn.style.borderColor = mode === 'both' ? '#c0c0c0' : '#fff';
        activeBtn.style.fontWeight = 'bold';
    }

    // Перерисовываем график с новыми данными
    if (window.radarData) {
        drawRadarChart(window.radarData.me, window.radarData.any);
    }
}