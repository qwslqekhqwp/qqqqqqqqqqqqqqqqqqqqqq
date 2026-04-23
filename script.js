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
let wheelAngle = 0;                                           // Текущий угол поворота колеса

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
        alert("Код неверен.");
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
    const { data, error } = await supabaseClient.from('movies').select('*');
    
    if (error) {
        console.error(error);
    } else {
        allMovies = data;
        updateFilterOptions();
        applyFilters();
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
    if (error) alert(error.message); else location.reload();
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
    filtered.sort((a, b) => {
        if (sort === 'rating-desc') return calculateRating(b).total - calculateRating(a).total;
        if (sort === 'title-asc') return a.title.localeCompare(b.title);
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
    
    if (!title) return alert("Введите название фильма");
    
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
            return alert("Фильм не найден");
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
        
        alert(`Данные подгружены! Рейтинг TMDB: ${tempExternalRating}`);
    } catch (err) {
        alert("Ошибка при поиске данных");
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
    
    const newMovie = { 
        title: document.getElementById('new-title').value, 
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
    
    // Вычисляем основные метрики
    const avgScore = (viewed.reduce((acc, m) => acc + calculateRating(m).total, 0) / viewed.length).toFixed(1);
    const totalMinutes = viewed.reduce((acc, m) => acc + (parseInt(m.duration) || 0), 0);
    const totalMoviesCount = viewed.length;
    
    // Находим интересные факты
    const longest = viewed.reduce((p, c) => (parseInt(c.duration || 0) > parseInt(p.duration || 0)) ? c : p);
    const oldest = viewed.reduce((p, c) => (parseInt(c.year || 3000) < parseInt(p.year || 3000)) ? c : p);
    const controversial = viewed.reduce((p, c) => (Math.abs(calculateRating(c).me - calculateRating(c).any) > Math.abs(calculateRating(p).me - calculateRating(p).any)) ? c : p);
    const maxDiff = Math.abs(calculateRating(controversial).me - calculateRating(controversial).any).toFixed(1);

    // Анализируем жанры
    const genreData = {};
    viewed.forEach(m => {
        if (m.genre) {
            m.genre.split(',').forEach(g => {
                const name = g.trim();
                if (!genreData[name]) genreData[name] = { count: 0, totalScore: 0 };
                genreData[name].count++;
                genreData[name].totalScore += calculateRating(m).total;
            });
        }
    });

    const sortedGenres = Object.entries(genreData)
        .map(([name, data]) => ({
            name,
            count: data.count,
            avg: data.totalScore / data.count,
            score: (data.totalScore / data.count) * (1 + Math.log10(data.count))
        }))
        .sort((a, b) => b.score - a.score);

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

    // Формируем HTML статистики
    container.innerHTML = `
        <style>
            .stats-group-title { text-align: center; color: #555; font-size: 0.7rem; letter-spacing: 2px; margin: 30px 0 15px; text-transform: uppercase; }
            .stats-grid-main { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
            .stats-grid-records { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 30px; }
            .stats-grid-tops { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .record-card { background:#111; padding:15px; border-radius:12px; border:1px solid #222; text-align:center; min-height:100px; display:flex; flex-direction:column; justify-content:center; }
            .record-card span { display: block; color: #c0c0c0; font-size: 0.7rem; margin-top: 5px; opacity: 0.7; }
            
            .genre-bar-container { background: #161616; padding: 20px; border-radius: 15px; border: 1px solid #2a2a2a; margin-bottom: 30px; }
            .genre-item { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
            .genre-name { font-size: 0.75rem; width: 110px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #aaa; text-transform: uppercase; }
            .genre-track { flex: 1; height: 8px; background: #222; border-radius: 4px; overflow: hidden; }
            .genre-fill { height: 100%; background: linear-gradient(90deg, #333, #666); border-radius: 4px; transition: width 0.5s ease; }
            .genre-info { font-size: 0.7rem; color: #555; min-width: 70px; text-align: right; }

            @media (max-width: 600px) { 
                .stats-grid-main, .stats-grid-records, .stats-grid-tops { grid-template-columns: 1fr !important; }
                .genre-name { width: 80px; }
            }
        </style>

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
                <p style="font-size:0.55rem; color:#555; margin:0 0 8px 0;">МАКС. РАЗНИЦА</p>
                <div style="font-size:0.85rem;">${controversial.title}</div>
                <span>Разница: ${maxDiff}</span>
            </div>
        </div>

        <h3 class="stats-group-title">РЕЙТИНГ ЖАНРОВ</h3>
        <div class="genre-bar-container">
            ${sortedGenres.map(g => {
                const percent = (g.avg * 10);
                return `
                    <div class="genre-item">
                        <div class="genre-name">${g.name}</div>
                        <div class="genre-track">
                            <div class="genre-fill" style="width: ${percent}%; opacity: ${0.2 + (g.count/totalMoviesCount) * 0.8}"></div>
                        </div>
                        <div class="genre-info">${g.avg.toFixed(1)} ★ (${g.count})</div>
                    </div>
                `;
            }).join('')}
        </div>

        <div class="stats-grid-tops">
            ${renderMiniList([...viewed].sort((a,b)=>calculateRating(b).total-calculateRating(a).total).slice(0,5), "🔥 ТОП ЛУЧШИХ", true)}
            ${renderMiniList([...viewed].sort((a,b)=>calculateRating(a).total-calculateRating(b).total).slice(0,5), "💀 ТОП ХУДШИХ", false)}
        </div>`;
}

// ==========================================
// 12. РУЛЕТКА - ВЫБОР ФИЛЬМА
// ==========================================

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
        alert("Добавьте хотя бы 2 фильма в 'Не просмотрено'!");
        return;
    }

    localStorage.setItem('roulette_session', JSON.stringify(currentRouletteMovies));
    
    const spinBtn = document.getElementById('spin-button');
    spinBtn.disabled = false;
    spinBtn.style.opacity = "1";
    spinBtn.style.cursor = "pointer";
    
    document.getElementById('winner-display').innerText = `Список готов: ${currentRouletteMovies.length} поз.`;
    wheelAngle = 0; 
    drawWheel();
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
        
        if (typeof initCanvasWheel === "function") initCanvasWheel();
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
    currentRouletteMovies.forEach((movie, i) => {
        const angle = angleOffset + i * sliceAngle;
        
        ctx.globalAlpha = opacity;
        
        // Рисуем градиент каждого сектора
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        if (i % 3 === 0) {
            gradient.addColorStop(0, '#1a1a1a');
            gradient.addColorStop(1, '#0a0a0a');
        } else if (i % 3 === 1) {
            gradient.addColorStop(0, '#2a2a2a');
            gradient.addColorStop(1, '#151515');
        } else {
            gradient.addColorStop(0, '#111111');
            gradient.addColorStop(1, '#050505');
        }
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, angle, angle + sliceAngle);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Рисуем линии между секторами
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 * opacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Добавляем название фильма в сектор
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle + sliceAngle / 2);
        ctx.textAlign = "right";
        ctx.fillStyle = `rgba(204, 204, 204, ${opacity})`;
        ctx.font = `600 ${Math.max(11, 700 / 55)}px 'Segoe UI', sans-serif`;
        const shortTitle = movie.title.length > 25 ? movie.title.substring(0, 22) + '...' : movie.title;
        ctx.fillText(shortTitle, radius - 35, 5);
        ctx.restore();
    });

    // Рисуем центр колеса
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 15, 0, Math.PI * 2);
    const hubGrad = ctx.createRadialGradient(centerX - 4, centerY - 4, 2, centerX, centerY, 15);
    hubGrad.addColorStop(0, '#ffffff');
    hubGrad.addColorStop(1, '#444444');
    ctx.fillStyle = hubGrad;
    ctx.fill();
}

/**
 * Запускает вращение колеса рулетки
 * Использует плавную анимацию и выбирает случайный фильм
 */
function spinRoulette() {
    if (isSpinning || currentRouletteMovies.length < 2) return;

    isSpinning = true;
    const duration = (parseFloat(document.getElementById('spin-duration-input').value) || 5) * 1000;
    const startAngle = wheelAngle;
    const extraSpins = 8 + Math.random() * 5; 
    const targetAngle = startAngle + (extraSpins * 2 * Math.PI) + Math.random() * (2 * Math.PI);
    
    let startTime = null;
    const sliceAngle = (2 * Math.PI) / currentRouletteMovies.length;

    function animate(currentTime) {
        if (!startTime) startTime = currentTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Используем ease-out анимацию для замедления в конце
        const easing = 1 - Math.pow(1 - progress, 4);
        const oldAngle = wheelAngle;
        wheelAngle = startAngle + (targetAngle - startAngle) * easing;
        
        const delta = wheelAngle - oldAngle;

        // Проверяем пересечение границы сектора для звука трещотки
        const currentSector = Math.floor((1.5 * Math.PI - wheelAngle) / sliceAngle);
        const lastSector = Math.floor((1.5 * Math.PI - oldAngle) / sliceAngle);
        
        if (currentSector !== lastSector) {
            playTickSound();
        }

        const canvas = document.getElementById('wheelCanvas');
        const ctx = canvas.getContext('2d');
        const size = canvas.parentElement.offsetWidth;
        ctx.clearRect(0, 0, size, size);

        if (delta > 0.05) {
            renderSectors(ctx, size/2, size/2, size/2 - 30, sliceAngle, wheelAngle - delta * 0.5, 0.4);
        }
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
    const normalizedAngle = (1.5 * Math.PI - (wheelAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
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
        // Режим "На выбывание" — удаляем выбранный фильм
        currentRouletteMovies.splice(winningIndex, 1);
        localStorage.setItem('roulette_session', JSON.stringify(currentRouletteMovies));
        
        playFadeSound();
        drawWheel();

        if (currentRouletteMovies.length > 1) {
            display.innerText = `ВЫБЫЛ: ${winner.title}`;
            display.style.color = "#ff4d4d";
        } else if (currentRouletteMovies.length === 1) {
            // Если остался один фильм — он победитель
            const finalWinner = currentRouletteMovies[0];
            display.innerText = `ПОБЕДИТЕЛЬ: ${finalWinner.title}`;
            display.style.color = "#fff";
            
            setTimeout(() => {
                showWinnerOverlay("ВЫИГРАЛ ФИЛЬМ:", finalWinner.title);
            }, 400); 
        }
    } else {
        // Обычный режим — сразу показываем результат
        display.innerText = `ВЫБРАНО: ${winner.title}`;
        display.style.color = "#fff";
        showWinnerOverlay("ВЫИГРАЛ ФИЛЬМ:", winner.title);
    }
}

// ==========================================
// 12.1 МОБИЛЬНАЯ РУЛЕТКА (БАРАБАН)
// ==========================================

/**
 * Подготавливает барабан: собирает фильмы и размножает их для эффекта долгого кручения
 */
// ==========================================
// 12.1 МОБИЛЬНАЯ РУЛЕТКА (СВАЙП)
// ==========================================

let currentTranslateY = 0;
let dragStartY = 0;
let isDraggingDrum = false;
let lastDragTime = 0;
let swipeVelocity = 0;

/**
 * Подготавливает барабан и вешает слушатели свайпов
 */
function prepareDrum() {
    const drumList = document.getElementById('drum-list');
    if (!drumList) return;

    const maxTime = parseInt(document.getElementById('time-filter').value) || 999;
    
    currentRouletteMovies = allMovies.filter(m => 
        m.status === 'Не просмотрено' && 
        (parseInt(m.duration) || 0) <= maxTime
    );

    drumList.innerHTML = '';
    currentTranslateY = 0;
    drumList.style.transition = 'none';
    drumList.style.transform = `translateY(0px)`;

    if (currentRouletteMovies.length < 2) {
        drumList.innerHTML = '<div class="drum-item" style="color:#ff4d4d; font-size: 0.8rem; white-space: normal; line-height: 1.2; padding-top: 10px;">ДОБАВЬТЕ ХОТЯ БЫ 2 ФИЛЬМА</div>';
        return;
    }

    // Размножаем список сильнее (например, 50 раз), чтобы листать можно было долго
    const repeatCount = 50; 
    for (let i = 0; i < repeatCount; i++) {
        currentRouletteMovies.forEach((m) => {
            const item = document.createElement('div');
            item.className = 'drum-item';
            item.innerText = m.title;
            drumList.appendChild(item);
        });
    }

    // Привязываем события касания
    const wrapper = document.querySelector('.drum-wrapper');
    
    // Очищаем старые обработчики, чтобы не дублировались при перезапуске
    wrapper.replaceWith(wrapper.cloneNode(true));
    const newWrapper = document.querySelector('.drum-wrapper');

    // Мобильные касания
    newWrapper.addEventListener('touchstart', handleDrumTouchStart, {passive: false});
    newWrapper.addEventListener('touchmove', handleDrumTouchMove, {passive: false});
    newWrapper.addEventListener('touchend', handleDrumTouchEnd);
    
    // Касания мышкой (для ПК, если тестируешь в браузере)
    newWrapper.addEventListener('mousedown', handleDrumTouchStart);
    window.addEventListener('mousemove', handleDrumTouchMove);
    window.addEventListener('mouseup', handleDrumTouchEnd);
}

// --- ФИЗИКА СВАЙПА ---

function handleDrumTouchStart(e) {
    if (isSpinning || currentRouletteMovies.length < 2) return;
    isDraggingDrum = true;
    
    dragStartY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    lastDragTime = Date.now();
    swipeVelocity = 0;

    const drumList = document.getElementById('drum-list');
    // Отключаем плавность при касании, чтобы барабан мгновенно лип к пальцу
    drumList.style.transition = 'none'; 
}

function handleDrumTouchMove(e) {
    if (!isDraggingDrum) return;
    e.preventDefault(); // Блокируем дергание экрана

    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - dragStartY;
    dragStartY = clientY;

    const now = Date.now();
    const deltaTime = now - lastDragTime;
    lastDragTime = now;

    // Считаем скорость свайпа
    if (deltaTime > 0) {
        swipeVelocity = deltaY / deltaTime; 
    }

    currentTranslateY += deltaY;
    
    // Защита от вытягивания барабана слишком высоко (за 0)
    if (currentTranslateY > 50) currentTranslateY = 50; 
    
    const drumList = document.getElementById('drum-list');
    drumList.style.transform = `translateY(${currentTranslateY}px)`;
}

function handleDrumTouchEnd(e) {
    if (!isDraggingDrum) return;
    isDraggingDrum = false;

    if (Math.abs(swipeVelocity) < 0.1) return; 

    isSpinning = true; 

    const drumList = document.getElementById('drum-list');
    const itemHeight = 50; 
    const totalItems = drumList.children.length;
    const maxScroll = -(totalItems - 1) * itemHeight;

    const amplitude = swipeVelocity * 600; 
    let targetY = currentTranslateY + amplitude;

    targetY = Math.round(targetY / itemHeight) * itemHeight;

    if (targetY > 0) targetY = 0;
    if (targetY < maxScroll) targetY = maxScroll;

    const duration = Math.min(Math.max(Math.abs(swipeVelocity) * 1.5, 1), 4);

    drumList.style.transition = `transform ${duration}s cubic-bezier(0.15, 0.5, 0.2, 1)`;
    drumList.style.transform = `translateY(${targetY}px)`;

    currentTranslateY = targetY; 
    
    console.log("Свайп завершен, летим... Время полета:", duration, "сек");

    // Ждем окончания полета
    setTimeout(() => {
        isSpinning = false;
        
        const winningElementIndex = Math.abs(targetY / itemHeight);
        const realMovieIndex = winningElementIndex % currentRouletteMovies.length;

        const winnerElement = drumList.children[winningElementIndex];
        if (winnerElement) {
            winnerElement.classList.add('winner-highlight');
        }

        // ЖЕСТКО ВЫЗЫВАЕМ ФУНКЦИЮ ПОКАЗА ОКНА
        finalizeMobileSpin(realMovieIndex);

    }, duration * 1000 + 100);
}

/**
 * Завершает мобильный спин, показывает победителя
 */
/**
 * Завершает мобильный спин, показывает победителя
 */
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
        // Режим выбывания
        currentRouletteMovies.splice(winningIndex, 1);
        
        if (currentRouletteMovies.length === 1) {
            // Если остался последний фильм - он победитель
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
            // Показываем, кто ВЫБЫЛ
            setTimeout(() => {
                overlayHeader.innerText = "ВЫБЫЛ ФИЛЬМ:";
                overlayTitle.innerText = winner.title;
                overlay.style.display = 'flex';
                overlay.style.pointerEvents = 'auto'; 
                setTimeout(() => overlay.style.opacity = '1', 50);
                
                // Перерисовываем барабан в фоне (уже без выбывшего фильма)
                prepareDrum();
            }, 500);
        }
    } else {
        // Обычный режим
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

/**
 * Воспроизводит звук трещотки при вращении колеса
 * Используется Web Audio API
 */
function playTickSound() {
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    
    osc.frequency.setValueAtTime(700, actx.currentTime);
    gain.gain.setValueAtTime(0.03, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(actx.destination);
    
    osc.start();
    osc.stop(actx.currentTime + 0.05);
}

/**
 * Воспроизводит звук исчезновения при режиме "На выбывание"
 * Нисходящий звук
 */
function playFadeSound() {
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    
    osc.frequency.setValueAtTime(300, actx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, actx.currentTime + 0.8);
    
    gain.gain.setValueAtTime(0.1, actx.currentTime);
    gain.gain.linearRampToValueAtTime(0, actx.currentTime + 0.8);
    
    osc.connect(gain);
    gain.connect(actx.destination);
    
    osc.start();
    osc.stop(actx.currentTime + 0.8);
}

/**
 * Триггерит анимацию и звук фанфар при выборе победителя
 */
function triggerWinAnimation() {
    const canvas = document.getElementById('wheelCanvas');
    canvas.style.transition = "transform 0.3s ease-out, filter 0.3s ease-out";
    
    // Эффект "вспышки"
    canvas.style.transform = "scale(1.05)";
    canvas.style.filter = "drop-shadow(0 0 30px rgba(255, 255, 255, 0.5))";
    
    // Звук фанфар (синтезированный аккорд до-мажор)
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C, E, G, C
    
    notes.forEach((freq, i) => {
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        
        osc.frequency.setValueAtTime(freq, actx.currentTime + i * 0.1);
        gain.gain.setValueAtTime(0.1, actx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, actx.currentTime + i * 0.1 + 0.5);
        
        osc.connect(gain);
        gain.connect(actx.destination);
        
        osc.start(actx.currentTime + i * 0.1);
        osc.stop(actx.currentTime + i * 0.1 + 0.5);
    });

    setTimeout(() => {
        canvas.style.transform = "scale(1)";
        canvas.style.filter = "drop-shadow(0 0 12px rgba(255, 255, 255, 0.1))";
    }, 500);
}

/**
 * Закрывает оверлей с результатом победителя
 */
function closeWinnerOverlay() {
    const overlay = document.getElementById('winner-overlay');
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
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
