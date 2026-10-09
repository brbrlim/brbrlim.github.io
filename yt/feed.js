// Feed page for /yt/: renders cards from feed/N.json (newest first), a page at
// a time as you scroll. Searching pulls in every chunk, then filters locally.
;(function () {
  var FEED = window.YT_FEED
  var PAGE = 48
  var grid = document.getElementById("grid")
  var input = document.getElementById("q")
  var chips = document.getElementById("chips")
  var status = document.getElementById("status")
  var sentinel = document.getElementById("sentinel")

  var loaded = [] // chunk index → entries
  var pending = {}
  var view = [] // entries matching the current query, in order
  var shown = 0
  var query = ""
  var run = 0 // bumps on every new query so stale async work is dropped

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  }

  function loadChunk(n) {
    if (loaded[n]) return Promise.resolve(loaded[n])
    if (!pending[n]) {
      pending[n] = fetch("feed/" + n + ".json")
        .then(function (r) {
          if (!r.ok) throw new Error("feed " + n + ": " + r.status)
          return r.json()
        })
        .then(function (rows) {
          loaded[n] = rows
          return rows
        })
        .finally(function () {
          delete pending[n]
        })
    }
    return pending[n]
  }

  function card(e) {
    return (
      '<a class="card" href="' + encodeURIComponent(e.s) + '.html">' +
      '<div class="cover"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/' + esc(e.i) + '/hqdefault.jpg">' +
      (e.l ? '<span class="dur">' + esc(e.l) + "</span>" : "") +
      "</div>" +
      '<div class="body"><p class="title">' + esc(e.t) + "</p>" +
      '<p class="meta"><span>' + esc(e.c) + "</span><span>" + esc(e.d) + "</span></p>" +
      '<p class="snip">' + esc(e.x) + "</p></div></a>"
    )
  }

  function matches(e, q) {
    if (q.charAt(0) === "#") return e.g.indexOf(q.slice(1)) >= 0
    return (e.t + "\n" + e.c + "\n" + e.g.join(" ")).toLowerCase().indexOf(q) >= 0
  }

  function setStatus() {
    if (query) {
      status.textContent = view.length
        ? "검색 결과 " + view.length.toLocaleString() + "편"
        : "검색 결과가 없습니다."
    } else {
      status.textContent = shown >= FEED.total ? "끝 — 전체 " + FEED.total.toLocaleString() + "편" : ""
    }
  }

  // Append the next page of cards; resolves to whether anything was added.
  // Without a query, chunks are fetched lazily.
  function more() {
    var mine = run
    var want = shown + PAGE
    var need = query ? Promise.resolve() : loadChunk(Math.min(FEED.chunks - 1, Math.floor((want - 1) / FEED.perChunk)))
    return need
      .then(function () {
        if (mine !== run) return false
        if (!query) view = [].concat.apply([], loaded.filter(Boolean))
        var slice = view.slice(shown, want)
        if (slice.length) {
          grid.insertAdjacentHTML("beforeend", slice.map(card).join(""))
          shown += slice.length
        }
        setStatus()
        return slice.length > 0
      })
      .catch(function () {
        status.textContent = "목록을 불러오지 못했습니다. 새로고침해 주세요."
        return false
      })
  }

  function reset(q) {
    query = q.trim().toLowerCase()
    run++
    var mine = run
    shown = 0
    view = []
    grid.innerHTML = ""
    Array.prototype.forEach.call(chips.children, function (c) {
      c.classList.toggle("on", "#" + c.dataset.tag === query)
    })
    var url = query ? "?q=" + encodeURIComponent(query) : location.pathname
    history.replaceState(null, "", url)

    if (!query) return more().then(fill)
    status.textContent = "검색 중…"
    var all = []
    for (var n = 0; n < FEED.chunks; n++) all.push(loadChunk(n))
    return Promise.all(all)
      .then(function () {
        if (mine !== run) return
        view = [].concat.apply([], loaded).filter(function (e) {
          return matches(e, query)
        })
        return more().then(fill)
      })
      .catch(function () {
        status.textContent = "목록을 불러오지 못했습니다. 새로고침해 주세요."
      })
  }

  function hasMore() {
    return shown < (query ? view.length : FEED.total)
  }

  // Keep loading while the sentinel is still on screen (tall viewports).
  function fill() {
    var mine = run
    if (!hasMore() || sentinel.getBoundingClientRect().top > innerHeight + 600) return
    return more().then(function (added) {
      if (added && mine === run) return fill()
    })
  }

  chips.innerHTML = FEED.tags
    .map(function (t) {
      return '<button type="button" data-tag="' + esc(t) + '">#' + esc(t) + "</button>"
    })
    .join("")
  chips.addEventListener("click", function (ev) {
    var tag = ev.target.dataset && ev.target.dataset.tag
    if (!tag) return
    input.value = query === "#" + tag ? "" : "#" + tag
    reset(input.value)
  })

  var timer
  input.addEventListener("input", function () {
    clearTimeout(timer)
    timer = setTimeout(function () {
      reset(input.value)
    }, 180)
  })

  new IntersectionObserver(
    function (entries) {
      if (entries[0].isIntersecting && hasMore()) fill()
    },
    { rootMargin: "600px" },
  ).observe(sentinel)

  var initial = new URLSearchParams(location.search).get("q") || ""
  input.value = initial
  loadChunk(0).then(function () {
    reset(initial)
  })
})()
