// Feed page for /yt/.
//
// Three ways in, all driven by the URL so they can be linked and shared:
//   (default)    topic sections — the latest few videos of each topic
//   ?view=all    everything, newest first, a page at a time as you scroll
//   ?q=…         a filter: free text, #tag, @channel, topic:<key> or is:fav
//
// Card data lives in feed/N.json (newest first). The front page needs only
// feed/sections.json; a filter pulls in every chunk, then matches locally.
;(function () {
  var FEED = window.YT_FEED
  var PAGE = 48
  var out = document.getElementById("out")
  var input = document.getElementById("q")
  var status = document.getElementById("status")
  var sentinel = document.getElementById("sentinel")
  var views = document.getElementById("views")

  var loaded = [] // chunk index → entries
  var pending = {}
  var grid = null // the card grid being appended to (list views only)
  var list = [] // entries of the current list view, in order
  var shown = 0
  var query = ""
  var view = "topics"
  var run = 0 // bumps on every re-render so stale async work is dropped

  var topicLabel = {}
  FEED.topics.forEach(function (t) {
    topicLabel[t.k] = t.label
  })

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  }

  function getJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ": " + r.status)
      return r.json()
    })
  }

  function loadChunk(n) {
    if (loaded[n]) return Promise.resolve(loaded[n])
    if (!pending[n]) {
      pending[n] = getJson("feed/" + n + ".json")
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
      (e.f ? '<span class="star" title="Favorites">★</span>' : "") +
      (e.l ? '<span class="dur">' + esc(e.l) + "</span>" : "") +
      "</div>" +
      '<div class="body"><p class="title">' + esc(e.t) + "</p>" +
      '<p class="meta"><span>' + esc(e.c) + "</span><span>" + esc(e.d) + "</span></p>" +
      '<p class="snip">' + esc(e.x) + "</p></div></a>"
    )
  }

  function matches(e, q) {
    if (q === "is:fav") return !!e.f
    if (q.indexOf("topic:") === 0) return e.k === q.slice(6)
    if (q.charAt(0) === "#") return e.g.indexOf(q.slice(1)) >= 0
    if (q.charAt(0) === "@") return e.c.toLowerCase() === q.slice(1)
    return (e.t + "\n" + e.c + "\n" + e.g.join(" ")).toLowerCase().indexOf(q) >= 0
  }

  // What the current filter is, in words, for the heading above the results.
  function describe(q) {
    if (q === "is:fav") return "★ Favorites"
    if (q.indexOf("topic:") === 0) return topicLabel[q.slice(6)] || q
    return q
  }

  function fail() {
    status.textContent = "목록을 불러오지 못했습니다. 새로고침해 주세요."
    return false
  }

  // ── list views (filter, or everything newest-first) ──────────────────────

  function hasMore() {
    return !!grid && shown < (query ? list.length : FEED.total)
  }

  // Append the next page of cards; resolves to whether anything was added.
  // Unfiltered, chunks are fetched only as the scroll reaches them.
  function more() {
    var mine = run
    var want = shown + PAGE
    var need = query
      ? Promise.resolve()
      : loadChunk(Math.min(FEED.chunks - 1, Math.floor((want - 1) / FEED.perChunk)))
    return need
      .then(function () {
        if (mine !== run) return false
        if (!query) list = [].concat.apply([], loaded.filter(Boolean))
        var slice = list.slice(shown, want)
        if (slice.length) {
          grid.insertAdjacentHTML("beforeend", slice.map(card).join(""))
          shown += slice.length
        }
        if (!hasMore()) status.textContent = "끝 — " + shown.toLocaleString() + "편"
        return slice.length > 0
      })
      .catch(fail)
  }

  // Keep loading while the sentinel is still on screen (tall viewports).
  function fill() {
    var mine = run
    if (!hasMore() || sentinel.getBoundingClientRect().top > innerHeight + 600) return
    return more().then(function (added) {
      if (added && mine === run) return fill()
    })
  }

  function startList(heading) {
    out.innerHTML = (heading ? '<h2 class="sec-title">' + heading + "</h2>" : "") + '<div class="grid"></div>'
    grid = out.lastChild
    shown = 0
    return more().then(fill)
  }

  // ── topic sections (front page) ──────────────────────────────────────────

  function showSections() {
    var mine = run
    return getJson("feed/sections.json")
      .then(function (sections) {
        if (mine !== run) return
        out.innerHTML = FEED.topics
          .map(function (t) {
            var rows = sections[t.k] || []
            if (!rows.length) return ""
            return (
              '<section class="sec"><h2 class="sec-title"><a href="?q=' + encodeURIComponent("topic:" + t.k) + '" data-q="topic:' + esc(t.k) + '">' +
              esc(t.label) + ' <span>' + t.n.toLocaleString() + "편 전체 보기 →</span></a></h2>" +
              '<div class="grid">' + rows.map(card).join("") + "</div></section>"
            )
          })
          .join("")
      })
      .catch(fail)
  }

  // ── state → screen ───────────────────────────────────────────────────────

  function mark(container, value) {
    Array.prototype.forEach.call(container.children, function (c) {
      c.classList.toggle("on", c.dataset.q === value)
    })
  }

  function render() {
    run++
    var mine = run
    grid = null
    list = []
    status.textContent = ""
    ;["topics", "channels", "tags"].forEach(function (id) {
      mark(document.getElementById(id), query)
    })
    mark(views, query === "is:fav" ? "is:fav" : query ? null : "view:" + view)

    var params = new URLSearchParams()
    if (query) params.set("q", query)
    else if (view === "all") params.set("view", "all")
    var search = params.toString()
    history.replaceState(null, "", search ? "?" + search : location.pathname)

    if (!query) return view === "all" ? startList("") : showSections()

    status.textContent = "불러오는 중…"
    var all = []
    for (var n = 0; n < FEED.chunks; n++) all.push(loadChunk(n))
    return Promise.all(all)
      .then(function () {
        if (mine !== run) return
        list = [].concat.apply([], loaded).filter(function (e) {
          return matches(e, query)
        })
        status.textContent = list.length ? "" : "해당하는 영상이 없습니다."
        return startList(esc(describe(query)) + " <span>" + list.length.toLocaleString() + "편</span>")
      })
      .catch(fail)
  }

  function setQuery(q) {
    query = q.trim().toLowerCase()
    input.value = /^(topic:|is:)/.test(query) ? "" : q.trim()
    render()
  }

  function chip(q, label) {
    return '<button type="button" data-q="' + esc(q) + '">' + label + "</button>"
  }

  views.innerHTML =
    chip("view:topics", "주제별") +
    chip("view:all", "최신순") +
    chip("is:fav", "★ Favorites <span>" + FEED.favorites.toLocaleString() + "</span>") +
    '<a href="briefings.html">데일리 · 위클리 브리핑 →</a>'
  document.getElementById("topics").innerHTML = FEED.topics
    .map(function (t) {
      return chip("topic:" + t.k, esc(t.label) + " <span>" + t.n.toLocaleString() + "</span>")
    })
    .join("")
  document.getElementById("channels").innerHTML = FEED.channels
    .map(function (c) {
      return chip("@" + c.c.toLowerCase(), esc(c.c) + " <span>" + c.n + "</span>")
    })
    .join("")
  document.getElementById("tags").innerHTML = FEED.tags
    .map(function (t) {
      return chip("#" + t, "#" + esc(t))
    })
    .join("")

  // Chips, view buttons and section headings all carry the state they lead to
  // in data-q; clicking the active filter again clears it.
  document.querySelector("main").addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-q]")
    if (!el) return
    ev.preventDefault()
    var q = el.dataset.q
    if (q.indexOf("view:") === 0) {
      view = q.slice(5)
      setQuery("")
    } else {
      setQuery(q === query ? "" : q)
    }
    if (el.closest(".sec")) scrollTo(0, 0)
  })

  var timer
  input.addEventListener("input", function () {
    clearTimeout(timer)
    timer = setTimeout(function () {
      query = input.value.trim().toLowerCase()
      render()
    }, 180)
  })

  new IntersectionObserver(
    function (entries) {
      if (entries[0].isIntersecting && hasMore()) fill()
    },
    { rootMargin: "600px" },
  ).observe(sentinel)

  var params = new URLSearchParams(location.search)
  view = params.get("view") === "all" ? "all" : "topics"
  setQuery(params.get("q") || "")
})()
