/*
 * GINT · Menú interactivo
 * Dibuja el menú, navega con teclado y reproduce cada episodio
 * dentro de la página con el visor público de Google Drive.
 */
(function () {
  "use strict";

  /* ================================================================== */
  /* Utilidades                                                          */
  /* ================================================================== */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const pad = (n) => String(n).padStart(2, "0");

  const esc = (value) =>
    String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  function plural(count, one, many) {
    return count + " " + (count === 1 ? one : many);
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/["'’`]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /* Acepta un enlace de Drive completo, un enlace "open?id=" o sólo el ID. */
  function parseDriveId(value) {
    if (!value) return "";
    const raw = String(value).trim();
    if (!raw) return "";
    const patterns = [
      /\/file\/d\/([A-Za-z0-9_-]{10,})/,
      /[?&]id=([A-Za-z0-9_-]{10,})/,
      /\/d\/([A-Za-z0-9_-]{10,})/
    ];
    for (let i = 0; i < patterns.length; i++) {
      const match = raw.match(patterns[i]);
      if (match) return match[1];
    }
    if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return raw;
    return "";
  }

  const driveEmbed = (id) => "https://drive.google.com/file/d/" + id + "/preview";
  const driveView = (id) => "https://drive.google.com/file/d/" + id + "/view";

  /* ================================================================== */
  /* Catálogo                                                            */
  /* ================================================================== */

  function normalizeCatalog(raw) {
    const source = raw && Array.isArray(raw.series) ? raw.series : [];
    const usedIds = {};

    const series = source.map((entry, seriesIndex) => {
      const item = entry || {};
      let id = slugify(item.id || item.title || "serie-" + (seriesIndex + 1)) || "serie-" + (seriesIndex + 1);
      if (usedIds[id]) id = id + "-" + (seriesIndex + 1);
      usedIds[id] = true;

      const seasons = (Array.isArray(item.seasons) ? item.seasons : [])
        .map((season, seasonIndex) => {
          const seasonNumber = Number(season && season.number) || seasonIndex + 1;

          const episodes = (Array.isArray(season && season.episodes) ? season.episodes : [])
            .map((rawEpisode, episodeIndex) => {
              const episode =
                typeof rawEpisode === "string" ? { driveId: rawEpisode } : rawEpisode || {};
              const episodeNumber = Number(episode.number) || episodeIndex + 1;
              const link =
                episode.driveId || episode.url || episode.link || episode.file || episode.src || "";

              return {
                number: episodeNumber,
                title: String(episode.title || "Episodio " + episodeNumber),
                duration: episode.duration ? String(episode.duration) : "",
                drive: episode.drive ? String(episode.drive) : "",
                thumb: episode.thumb || episode.image || "",
                videoId: parseDriveId(link)
              };
            })
            .sort((a, b) => a.number - b.number);

          return {
            number: seasonNumber,
            title: String((season && season.title) || "Temporada " + seasonNumber),
            episodes
          };
        })
        .sort((a, b) => a.number - b.number);

      return {
        id,
        title: String(item.title || "Serie " + (seriesIndex + 1)),
        year: item.year ? String(item.year) : "",
        synopsis: item.synopsis || item.description || "",
        cover: item.cover || item.poster || "",
        backdrop: item.backdrop || item.cover || item.poster || "",
        seasons
      };
    });

    return { series };
  }

  const catalog = normalizeCatalog(window.GINT_CATALOG);

  const totalEpisodes = (s) =>
    s.seasons.reduce((sum, season) => sum + season.episodes.length, 0);

  /* Lista plana de episodios reproducibles de una serie, en orden. */
  function playableList(s) {
    const list = [];
    s.seasons.forEach((season) => {
      season.episodes.forEach((episode) => {
        if (episode.videoId) {
          list.push({
            season: season.number,
            episode: episode.number,
            key: season.number + "-" + episode.number,
            title: episode.title
          });
        }
      });
    });
    return list;
  }

  function findByKey(s, key) {
    for (let i = 0; i < s.seasons.length; i++) {
      const season = s.seasons[i];
      for (let j = 0; j < season.episodes.length; j++) {
        const episode = season.episodes[j];
        if (season.number + "-" + episode.number === key) {
          return { season, episode };
        }
      }
    }
    return null;
  }

  /* ================================================================== */
  /* Progreso guardado en el navegador                                   */
  /* ================================================================== */

  const PROGRESS_KEY = "gint.progress.v1";
  let progress = loadProgress();

  function loadProgress() {
    try {
      const raw = window.localStorage.getItem(PROGRESS_KEY);
      return raw ? JSON.parse(raw) || {} : {};
    } catch (error) {
      return {};
    }
  }

  function saveProgress() {
    try {
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch (error) {
      /* modo privado: se ignora */
    }
  }

  function isSeen(seriesId, seasonNumber, episodeNumber) {
    const entry = progress[seriesId];
    return !!(entry && entry.seen && entry.seen[seasonNumber + "-" + episodeNumber]);
  }

  function markSeen(seriesId, seasonNumber, episodeNumber) {
    const entry = progress[seriesId] || { last: "", seen: {} };
    entry.seen = entry.seen || {};
    entry.seen[seasonNumber + "-" + episodeNumber] = true;
    entry.last = seasonNumber + "-" + episodeNumber;
    progress[seriesId] = entry;
    saveProgress();
  }

  function hasWatched(seriesId) {
    const entry = progress[seriesId];
    return !!(entry && entry.seen && Object.keys(entry.seen).length);
  }

  /*
   * Posición recordada: el último capítulo que se abrió, que es donde el
   * usuario lo dejó. El visor de Drive no informa del minuto, así que el
   * capítulo vuelve a empezar; para pasar al siguiente está "Siguiente"
   * en el reproductor.
   * Sin historial, el primero disponible.
   */
  function resumeTarget(s) {
    const entry = progress[s.id];
    const list = playableList(s);

    if (!list.length) return null;

    if (entry && entry.last) {
      const index = list.findIndex(
        (item) => item.season + "-" + item.episode === entry.last
      );
      if (index !== -1) return list[index];
    }

    return list[0];
  }

  /* ================================================================== */
  /* Estado + referencias del DOM                                        */
  /* ================================================================== */

  const state = {
    seriesIndex: 0,
    playing: null
  };

  const screenHome = $("#screen-home");
  const screenSeries = $("#screen-series");
  const menuList = $("#seriesMenu");
  const player = $("#player");
  const playerFrame = $("#playerFrame");

  /* ================================================================== */
  /* Menú principal                                                      */
  /* ================================================================== */

  function currentSeries() {
    return catalog.series[state.seriesIndex] || null;
  }

  function renderMenu() {
    menuList.innerHTML = "";

    if (!catalog.series.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.innerHTML = "Añade series en <code>assets/js/catalog.js</code>";
      menuList.appendChild(empty);
      return;
    }

    catalog.series.forEach((s, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "menu__item";
      button.dataset.index = String(index);
      button.innerHTML =
        '<span class="menu__index">' + pad(index + 1) + "</span>" +
        '<span class="menu__label">' + esc(s.title) + "</span>" +
        '<span class="menu__meta">' + s.seasons.length + " T</span>";

      button.addEventListener("mouseenter", () => selectSeries(index));
      button.addEventListener("focus", () => selectSeries(index));
      button.addEventListener("click", () => openSeries(s.id));

      menuList.appendChild(button);
    });
  }

  function selectSeries(index) {
    if (!catalog.series.length) return;
    const total = catalog.series.length;
    state.seriesIndex = ((index % total) + total) % total;
    renderHero();
  }

  function renderHero() {
    const s = currentSeries();
    if (!s) return;

    $("#heroTitle").textContent = s.title;
    $("#heroMeta").textContent = [
      s.year,
      plural(s.seasons.length, "temporada", "temporadas"),
      plural(totalEpisodes(s), "episodio", "episodios")
    ]
      .filter(Boolean)
      .join(" · ");
    $("#heroSynopsis").textContent = s.synopsis || "";
    $("#homeCount").textContent = plural(catalog.series.length, "serie", "series");

    const art = $("#homeArt");
    const image = s.backdrop || s.cover;
    if (image) {
      art.style.backgroundImage = 'url("' + image + '")';
      art.classList.add("has-art");
    } else {
      art.style.backgroundImage = "none";
      art.classList.remove("has-art");
    }

    const target = resumeTarget(s);
    const watched = hasWatched(s.id);
    const playButton = $("#btnPlay");
    playButton.disabled = !target;
    $("#btnPlayLabel").textContent = watched ? "Continuar" : "Reproducir";

    const seasonRow = $("#homeSeasons");
    seasonRow.innerHTML = "";
    seasonRow.hidden = !s.seasons.length;
    s.seasons.forEach((season) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "season-btn";
      button.textContent = season.title;
      button.title = plural(season.episodes.length, "episodio", "episodios");
      button.addEventListener("click", () => {
        navigate("#/serie/" + s.id + "/" + season.number);
      });
      seasonRow.appendChild(button);
    });

    const note = $("#heroResume");
    if (target) {
      const season = s.seasons.filter((item) => item.number === target.season)[0];
      const episode = season
        ? season.episodes.filter((item) => item.number === target.episode)[0]
        : null;
      const where =
        "T" + target.season + " · E" + pad(target.episode) +
        (episode ? " — " + episode.title : "");
      note.textContent = (watched ? "Continúa en " : "Empieza por ") + where;
      playButton.title = (watched ? "Continúa en " : "Empieza por ") + where;
    } else {
      note.textContent = "";
      playButton.removeAttribute("title");
    }

    $$(".menu__item", menuList).forEach((item, index) => {
      const active = index === state.seriesIndex;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-current", active ? "true" : "false");
    });
  }

  function focusMenuItem(index) {
    const item = $$(".menu__item", menuList)[index];
    if (item) item.focus({ preventScroll: true });
  }

  /* ================================================================== */
  /* Pantalla de capítulos                                               */
  /* ================================================================== */

  function renderSeriesScreen(seriesId, seasonNumber) {
    const s = catalog.series.filter((item) => item.id === seriesId)[0];
    if (!s) {
      navigate("#/");
      return;
    }

    const index = catalog.series.indexOf(s);
    if (index !== -1) state.seriesIndex = index;

    const season =
      s.seasons.filter((item) => item.number === Number(seasonNumber))[0] || s.seasons[0];

    $("#seriesTitle").textContent = s.title;
    $("#seriesEyebrow").textContent = s.year ? "Serie · " + s.year : "Serie";
    $("#seriesSynopsis").textContent = s.synopsis || "";
    $("#seriesCount").textContent =
      plural(s.seasons.length, "temporada", "temporadas") +
      " · " +
      plural(totalEpisodes(s), "episodio", "episodios");

    const art = $("#seriesArt");
    const image = s.backdrop || s.cover;
    if (image) {
      art.style.backgroundImage = 'url("' + image + '")';
      art.classList.add("has-art");
    } else {
      art.style.backgroundImage = "none";
      art.classList.remove("has-art");
    }

    const tabs = $("#seasonTabs");
    tabs.innerHTML = "";
    s.seasons.forEach((item) => {
      const active = season && item.number === season.number;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "season-btn" + (active ? " is-active" : "");
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.textContent = item.title;
      button.addEventListener("click", () => {
        navigate("#/serie/" + s.id + "/" + item.number);
      });
      tabs.appendChild(button);
    });

    const grid = $("#episodeGrid");
    grid.innerHTML = "";

    if (!s.seasons.length) {
      grid.innerHTML = '<p class="empty">Esta serie todavía no tiene temporadas.</p>';
    } else if (!season || !season.episodes.length) {
      grid.innerHTML = '<p class="empty">Esta temporada todavía no tiene episodios.</p>';
    } else {
      season.episodes.forEach((episode, episodeIndex) => {
        grid.appendChild(episodeCard(s, season, episode, episodeIndex));
      });
    }

    showScreen("series");
    document.title = s.title + " · GINT";
  }

  function episodeCard(s, season, episode, episodeIndex) {
    const seen = isSeen(s.id, season.number, episode.number);
    const playable = !!episode.videoId;
    const hue = (episodeIndex * 47 + 22) % 360;
    const image = episode.thumb || s.cover || "";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ep" + (playable ? "" : " ep--pending");
    button.dataset.season = String(season.number);
    button.dataset.episode = String(episode.number);

    const subtitle =
      [episode.duration, episode.drive].filter(Boolean).join(" · ") || "";

    const thumbStyle =
      "--h:" + hue +
      (image
        ? ';background-image:linear-gradient(180deg,rgba(8,9,11,.05),rgba(8,9,11,.9)),url(&quot;' +
          esc(image) +
          '&quot;)'
        : "");

    button.innerHTML =
      '<span class="ep__thumb" style="' + thumbStyle + '">' +
        '<span class="ep__num">' + pad(episode.number) + "</span>" +
        (playable ? '<span class="ep__play" aria-hidden="true">▶</span>' : "") +
      "</span>" +
      '<span class="ep__body">' +
        '<span class="ep__title">' + esc(episode.title) + "</span>" +
        (subtitle ? '<span class="ep__sub">' + esc(subtitle) + "</span>" : "") +
      "</span>" +
      (seen ? '<span class="ep__flag">Visto</span>' : "") +
      (playable ? "" : '<span class="ep__flag ep__flag--warn">Sin enlace</span>');

    if (playable) {
      button.setAttribute(
        "aria-label",
        "Reproducir " + episode.title + " de " + season.title
      );
      button.addEventListener("click", () => {
        navigate("#/serie/" + s.id + "/" + season.number + "/" + episode.number);
      });
    } else {
      button.disabled = true;
      button.title = 'Falta el enlace de Google Drive de este episodio en "assets/js/catalog.js"';
    }

    return button;
  }

  /* ================================================================== */
  /* Reproductor                                                         */
  /* ================================================================== */

  function openEpisode(seriesId, seasonNumber, episodeNumber) {
    const s = catalog.series.filter((item) => item.id === seriesId)[0];
    if (!s) return;

    const season = s.seasons.filter((item) => item.number === Number(seasonNumber))[0];
    if (!season) return;

    const episode = season.episodes.filter((item) => item.number === Number(episodeNumber))[0];
    if (!episode || !episode.videoId) return;

    const list = playableList(s);
    const index = list.findIndex(
      (item) => item.season === season.number && item.episode === episode.number
    );

    state.playing = { seriesId: s.id, season: season.number };

    playerFrame.src = driveEmbed(episode.videoId);

    $("#playerTitle").textContent = s.title + " — " + episode.title;
    $("#playerSub").textContent = [
      season.title,
      "E" + pad(episode.number),
      episode.duration,
      episode.drive
    ]
      .filter(Boolean)
      .join(" · ");

    $("#playerDrive").href = driveView(episode.videoId);

    setNavButton("#btnPrev", list[index - 1], s);
    setNavButton("#btnNext", list[index + 1], s);

    player.classList.add("is-open");
    markSeen(s.id, season.number, episode.number);

    const closeButton = $("#btnClosePlayer");
    if (closeButton) closeButton.focus({ preventScroll: true });
  }

  function setNavButton(selector, item, s) {
    const button = $(selector);
    if (!button) return;
    if (!item) {
      button.disabled = true;
      button.onclick = null;
      button.removeAttribute("title");
      return;
    }
    button.disabled = false;
    button.title = item.title;
    button.onclick = () => {
      navigate("#/serie/" + s.id + "/" + item.season + "/" + item.episode);
    };
  }

  function closePlayer() {
    playerFrame.src = "about:blank";
    player.classList.remove("is-open");
  }

  function saveFullscreen() {
    const stage = $(".player__stage");
    if (!stage) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (stage.requestFullscreen) {
      stage.requestFullscreen().catch(() => {});
    }
  }

  /* ================================================================== */
  /* Rutas (#/serie/gintama/1/3)                                         */
  /* ================================================================== */

  function showScreen(name) {
    screenHome.classList.toggle("is-active", name === "home");
    screenSeries.classList.toggle("is-active", name === "series");
    if (name === "home") document.title = "GINT · Menú interactivo";
  }

  function parseRoute() {
    let raw = "";
    try {
      raw = decodeURIComponent(String(window.location.hash || "").replace(/^#\/?/, "")).trim();
    } catch (error) {
      raw = String(window.location.hash || "").replace(/^#\/?/, "").trim();
    }

    if (!raw) return { view: "home" };

    const parts = raw.split("/").filter(Boolean);

    if (parts[0] === "serie" && parts[1]) {
      if (parts.length >= 4) {
        return {
          view: "episode",
          seriesId: parts[1],
          season: Number(parts[2]),
          episode: Number(parts[3])
        };
      }
      return {
        view: "series",
        seriesId: parts[1],
        season: parts[2] ? Number(parts[2]) : null
      };
    }

    return { view: "home" };
  }

  function route() {
    const r = parseRoute();

    if (r.view === "home") {
      closePlayer();
      showScreen("home");
      renderHero();
      return;
    }

    const s = catalog.series.filter((item) => item.id === r.seriesId)[0];
    if (!s) {
      navigate("#/");
      return;
    }

    if (r.view === "series") {
      closePlayer();
      renderSeriesScreen(s.id, r.season);
      return;
    }

    renderSeriesScreen(s.id, r.season);
    openEpisode(s.id, r.season, r.episode);
  }

  function navigate(hash) {
    if (window.location.hash === hash) {
      route();
    } else {
      window.location.hash = hash;
    }
  }

  function openSeries(seriesId) {
    if (!seriesId) return;
    navigate("#/serie/" + seriesId);
  }

  function exitPlayer() {
    const playing = state.playing;
    if (playing) {
      navigate("#/serie/" + playing.seriesId + "/" + playing.season);
    } else {
      navigate("#/");
    }
  }

  /* ================================================================== */
  /* Teclado                                                             */
  /* ================================================================== */

  function moveSelection(delta) {
    selectSeries(state.seriesIndex + delta);
    focusMenuItem(state.seriesIndex);
  }

  function moveEpisodeFocus(key) {
    const cards = $$(".ep:not(.ep--pending)", $("#episodeGrid"));
    if (!cards.length) return;

    const current = cards.indexOf(document.activeElement);
    const forward = key === "ArrowRight" || key === "ArrowDown";
    let next;

    if (current === -1) {
      next = 0;
    } else {
      next = current + (forward ? 1 : -1);
      if (next < 0) next = 0;
      if (next > cards.length - 1) next = cards.length - 1;
    }

    cards[next].focus({ preventScroll: true });
    cards[next].scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  document.addEventListener("keydown", (event) => {
    const key = event.key;

    if (player.classList.contains("is-open")) {
      if (key === "Escape") {
        event.preventDefault();
        exitPlayer();
      }
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey) return;

    if (screenHome.classList.contains("is-active")) {
      if (key === "ArrowDown" || key === "ArrowRight") {
        event.preventDefault();
        moveSelection(1);
      } else if (key === "ArrowUp" || key === "ArrowLeft") {
        event.preventDefault();
        moveSelection(-1);
      } else if (
        key === "Enter" &&
        !(event.target && event.target.closest && event.target.closest("button, a"))
      ) {
        event.preventDefault();
        const s = currentSeries();
        if (s) openSeries(s.id);
      }
      return;
    }

    if (screenSeries.classList.contains("is-active")) {
      if (key === "Escape") {
        event.preventDefault();
        navigate("#/");
      } else if (
        key === "ArrowRight" ||
        key === "ArrowLeft" ||
        key === "ArrowDown" ||
        key === "ArrowUp"
      ) {
        event.preventDefault();
        moveEpisodeFocus(key);
      }
    }
  });

  /* ================================================================== */
  /* Arranque                                                            */
  /* ================================================================== */

  $("#btnPlay").addEventListener("click", () => {
    const s = currentSeries();
    if (!s) return;
    const target = resumeTarget(s);
    if (!target) return;
    navigate("#/serie/" + s.id + "/" + target.season + "/" + target.episode);
  });

  $("#btnChapters").addEventListener("click", () => {
    const s = currentSeries();
    if (s) openSeries(s.id);
  });

  $("#btnBack").addEventListener("click", () => navigate("#/"));

  $("#btnClosePlayer").addEventListener("click", exitPlayer);
  $("#btnFull").addEventListener("click", saveFullscreen);

  window.addEventListener("hashchange", route);

  renderMenu();
  renderHero();
  route();
})();
