(function () {
  "use strict";

  /* Endereço do script do Google (app da Web). Cole aqui o link que termina em /exec. */
  var API_URL = window.PORTAL_API_URL || "";

  var ICONE = {
    trofeu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 5H5.2a3 3 0 0 0 3 4.2M16 5h2.8a3 3 0 0 1-3 4.2"/><path d="M12 12.5v3.5M8.5 21h7M9.6 21v-2.6h4.8V21"/></svg>',
    medalha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 2.5l3.2 6.4M16.5 2.5l-3.2 6.4"/><circle cx="12" cy="15" r="6"/><path d="M12 12l1 2 2.1.3-1.5 1.5.35 2.1L12 16.9l-1.95 1 .35-2.1-1.5-1.5L11 14z" fill="currentColor" stroke="none"/></svg>'
  };
  var TIPOS = {
    trofeu: { nome: "Troféu", plural: "Troféus", cor: "var(--trofeu)", icone: "trofeu" },
    ouro:   { nome: "Medalha de ouro", plural: "Medalhas de ouro", cor: "var(--ouro)", icone: "medalha" },
    prata:  { nome: "Medalha de prata", plural: "Medalhas de prata", cor: "var(--prata)", icone: "medalha" },
    bronze: { nome: "Medalha de bronze", plural: "Medalhas de bronze", cor: "var(--bronze)", icone: "medalha" }
  };
  var ORDEM_TIPOS = ["trofeu", "ouro", "prata", "bronze"];
  var ETAPAS = [
    { k: "recebido", n: "Recebido", cor: "var(--alerta)" },
    { k: "producao", n: "Em produção", cor: "var(--ceu)" },
    { k: "pronto", n: "Pronto", cor: "var(--ciano)" },
    { k: "enviado", n: "Enviado", cor: "#9C86FF" },
    { k: "entregue", n: "Entregue", cor: "var(--ok)" }
  ];
  var IDX = {}; ETAPAS.forEach(function (e, i) { IDX[e.k] = i; });
  var TRANSPORTES = ["Correios", "Jadlog", "Transportadora", "Motoboy", "Retirada na ARKE"];
  var CHAVE = "arke-su-portal";

  var estado = {
    senha: "", papel: null, dono: false, modo: "cliente",
    pedidos: new Map(), producao: new Map(), carregou: false, semConexao: false,
    mesFoco: mesDe(new Date()), filtro: "todos", busca: "",
    aberto: null, editando: null, sujo: false, vistos: new Set(), ocupado: 0
  };

  /* ---------- utilidades ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) anexar(e, arguments[i]);
    return e;
  }
  function anexar(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { anexar(e, x); }); return; }
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  function txt(v) { return typeof v === "string" ? v.trim() : (typeof v === "number" ? String(v) : ""); }
  function mesDe(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  function mesValido(m) { return /^\d{4}-\d{2}$/.test(m) ? m : ""; }
  function nomeMes(m) {
    var p = m.split("-"); var d = new Date(+p[0], +p[1] - 1, 1);
    var s = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(d);
    return { mes: s.charAt(0).toUpperCase() + s.slice(1), ano: p[0] };
  }
  function somaMes(m, n) { var p = m.split("-"); return mesDe(new Date(+p[0], +p[1] - 1 + n, 1)); }
  function dataHora(iso) {
    var d = new Date(iso); if (isNaN(d)) return "";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) + " · " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  function soData(iso) {
    if (!iso) return ""; var d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00") : new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  }
  function medalhao(tipo, grande) {
    var t = TIPOS[tipo] || TIPOS.trofeu;
    return el("span", { "class": "medalhao" + (grande ? " g" : ""), style: "--c:" + t.cor, html: ICONE[t.icone], "aria-hidden": "true" });
  }
  function etapaDe(id) {
    var r = estado.producao.get(id); var s = r && txt(r.status);
    return IDX[s] != null ? s : "recebido";
  }
  function pilula(k, cancelado) {
    if (cancelado) return el("span", { "class": "pilula", style: "--s:var(--tinta-2)", text: "Cancelado" });
    var e = ETAPAS[IDX[k]];
    return el("span", { "class": "pilula" + (k !== "entregue" ? " vivo" : ""), style: "--s:" + e.cor, text: e.n });
  }
  function trilha(k) {
    var i = IDX[k];
    var t = el("div", { "class": "trilha" + (k === "entregue" ? " final" : ""), style: "--p:" + (i / 4), role: "img", "aria-label": "Etapa " + (i + 1) + " de 5: " + ETAPAS[i].n });
    ETAPAS.forEach(function (e, j) {
      t.append(el("div", { "class": "no" + (j < i ? " feito" : "") + (j === i ? " agora" : "") }, el("i"), el("span", { text: e.n })));
    });
    return t;
  }
  function linkRastreio(r) {
    var link = txt(r && r.link);
    if (/^https?:\/\//i.test(link)) return link;
    if (txt(r && r.transportadora) === "Correios") return "https://rastreamento.correios.com.br/app/index.php";
    if (txt(r && r.transportadora) === "Jadlog") return "https://www.jadlog.com.br/jadlog/tracking";
    return "";
  }
  var toastTimer;
  function aviso(msg, ruim) {
    var t = $("toast"); t.textContent = msg; t.classList.toggle("ruim", !!ruim); t.classList.add("visivel");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("visivel"); }, 3600);
  }
  function lerLocal(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function gravarLocal(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function emArke() { return estado.dono && estado.modo === "arke"; }
  function listaPedidos() {
    var arr = [];
    estado.pedidos.forEach(function (d, id) { if (d && txt(d.nome)) arr.push({ id: id, d: d }); });
    arr.sort(function (a, b) { return txt(a.d.criadoEm).localeCompare(txt(b.d.criadoEm)); });
    return arr;
  }

  /* ---------- conversa com a planilha ---------- */
  var MSG = {
    senha: "Código de acesso incorreto. Confira e tente de novo.",
    bloqueado: "Muitas tentativas erradas. Espere 15 minutos e tente de novo.",
    travado: "Este pedido já entrou em produção e não pode mais ser alterado por aqui. Fale com a ARKE.",
    sem_permissao: "Só a ARKE pode atualizar produção e rastreio.",
    nao_encontrado: "Este pedido não foi encontrado. Recarregue a página.",
    dados: "Faltam dados obrigatórios do pedido. Confira o formulário.",
    rede: "Sem conexão com o portal agora. Confira sua internet e tente de novo.",
    falha: "O portal não conseguiu salvar. Tente de novo em instantes."
  };
  function chamar(acao, extra, senha) {
    if (!API_URL) return Promise.reject({ erro: "config" });
    var corpo = Object.assign({ acao: acao, senha: senha || estado.senha }, extra || {});
    estado.ocupado++;
    return fetch(API_URL, { method: "POST", body: JSON.stringify(corpo), redirect: "follow" })
      .then(function (r) { return r.json(); }, function () { throw { erro: "rede" }; })
      .then(function (res) {
        if (!res || !res.ok) throw { erro: (res && res.erro) || "falha" };
        aplicar(res);
        return res;
      })
      .finally(function () { estado.ocupado--; });
  }
  function textoErro(e) { return MSG[e && e.erro] || MSG.falha; }
  function aplicar(res) {
    estado.papel = res.papel; estado.dono = res.papel === "arke";
    if (!estado.dono) estado.modo = "cliente";
    var P = new Map(), R = new Map();
    (Array.isArray(res.pedidos) ? res.pedidos : []).forEach(function (p) {
      if (!p || !txt(p.id)) return;
      var hist = []; try { hist = JSON.parse(p.historico || "[]"); } catch (e) {}
      P.set(p.id, {
        codigo: p.codigo, mes: p.mes, tipo: p.tipo, nome: p.nome, gravacao: p.gravacao, contato: p.contato,
        destinatario: p.destinatario, cep: p.cep, rua: p.rua, complemento: p.complemento, bairro: p.bairro,
        cidade: p.cidade, uf: p.uf, obs: p.obs, criadoEm: p.criadoEm, editadoEm: p.editadoEm,
        cancelado: p.cancelado === "sim", canceladoEm: p.canceladoEm
      });
      R.set(p.id, { status: p.status, transportadora: p.transportadora, rastreio: p.rastreio, link: p.link, previsao: p.previsao, recado: p.recado, historico: hist });
    });
    estado.pedidos = P; estado.producao = R; estado.carregou = true; estado.semConexao = false;
    render();
  }
  function atualizar() {
    if (!estado.senha || estado.ocupado || estado.sujo || $("modal").classList.contains("aberto")) return;
    chamar("listar").catch(function (e) {
      if (e && e.erro === "senha") { sair(); return; }
      if (e && e.erro === "rede") { estado.semConexao = true; renderAvisos(); }
    });
  }
  setInterval(function () { if (document.visibilityState === "visible") atualizar(); }, 60000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") atualizar(); });

  /* ---------- entrar e sair ---------- */
  function mostrarEntrada(msg) {
    $("entrar").hidden = false; $("area-portal").hidden = true; $("btn-sair").hidden = true; $("alternar").hidden = true;
    $("papel").textContent = "Acesso restrito";
    var e = $("erro-entrar"); e.hidden = !msg; e.textContent = msg || "";
    setTimeout(function () { $("senha").focus(); }, 50);
  }
  function mostrarPortal() {
    $("entrar").hidden = true; $("area-portal").hidden = false; $("btn-sair").hidden = false;
    render();
  }
  function sair() {
    estado.senha = ""; estado.papel = null; estado.dono = false; estado.pedidos = new Map(); estado.producao = new Map(); estado.carregou = false;
    gravarLocal(CHAVE, null); fecharTudo(true); $("senha").value = ""; mostrarEntrada("");
  }
  $("form-entrar").addEventListener("submit", function (e) {
    e.preventDefault();
    var s = $("senha").value.trim().toUpperCase();
    var erro = $("erro-entrar"); erro.hidden = true;
    if (!s) { erro.textContent = "Digite o código de acesso."; erro.hidden = false; return; }
    if (!API_URL) { erro.textContent = "O portal ainda está sendo configurado pela ARKE."; erro.hidden = false; return; }
    var b = $("btn-entrar"); b.disabled = true; b.textContent = "Entrando…";
    chamar("listar", null, s).then(function (res) {
      estado.senha = s;
      if ($("lembrar").checked) gravarLocal(CHAVE, s); else gravarLocal(CHAVE, null);
      estado.modo = res.papel === "arke" ? (lerLocal(CHAVE + "-modo") === "cliente" ? "cliente" : "arke") : "cliente";
      mostrarPortal();
    }, function (err) { erro.textContent = textoErro(err); erro.hidden = false; })
      .finally(function () { b.disabled = false; b.textContent = "Entrar"; });
  });
  $("btn-sair").addEventListener("click", sair);

  /* ---------- render ---------- */
  function render() {
    if ($("area-portal").hidden) return;
    renderTopo(); renderAbertura(); renderPlacar(); renderAvisos(); renderChips(); renderLista();
    if (estado.aberto && !estado.sujo) renderGaveta();
  }

  function renderTopo() {
    $("alternar").hidden = !estado.dono;
    Array.prototype.forEach.call($("alternar").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.modo === estado.modo)); });
    $("papel").textContent = !estado.carregou ? "Carregando pedidos…" : emArke() ? "Você está como ARKE" : estado.dono ? "Prévia do que o Denny vê" : "Olá, Denny";
  }

  function renderAbertura() {
    var n = nomeMes(estado.mesFoco);
    var h = $("titulo-mes"); h.textContent = n.mes + " "; h.append(el("em", { text: n.ano }));
    $("mes-rotulo").textContent = estado.mesFoco === mesDe(new Date()) ? "Premiação deste mês" : "Premiação do mês";
    $("lide").textContent = emArke()
      ? "Lance a produção e o rastreio de cada vencedor. O Denny acompanha tudo por aqui."
      : "Lance os vencedores do mês e acompanhe a produção e o rastreio de cada peça, num lugar só.";
    $("btn-novo").lastChild.textContent = emArke() ? " Novo pedido" : " Lançar vencedor";
  }

  function renderPlacar() {
    var p = $("placar"); p.textContent = "";
    var doMes = listaPedidos().filter(function (x) { return x.d.mes === estado.mesFoco && !x.d.cancelado; });
    ORDEM_TIPOS.forEach(function (k) {
      var t = TIPOS[k];
      var q = doMes.filter(function (x) { return x.d.tipo === k; }).length;
      p.append(el("div", { "class": "vidro ficha-premio", style: "--c:" + t.cor }, medalhao(k), el("b", { "class": "num", text: q }), el("span", { text: q === 1 ? t.nome : t.plural })));
    });
    var cont = ETAPAS.map(function (e) { return doMes.filter(function (x) { return etapaDe(x.id) === e.k; }).length; });
    var barra = el("div", { "class": "barra", role: "img", "aria-label": "Situação dos pedidos do mês" });
    var leg = el("div", { "class": "legenda" });
    ETAPAS.forEach(function (e, i) {
      if (cont[i]) barra.append(el("i", { style: "flex-grow:" + cont[i] + ";background:" + e.cor + ";box-shadow:0 0 10px " + e.cor }));
      leg.append(el("span", { style: "--c:" + e.cor }, e.n + " ", el("b", { text: cont[i] })));
    });
    var total = doMes.length;
    p.append(el("div", { "class": "vidro ficha-status" },
      el("span", { "class": "rotulo", text: total ? total + (total === 1 ? " pedido no mês" : " pedidos no mês") : "Nenhum pedido neste mês" }),
      barra, leg));
  }

  function renderAvisos() {
    var a = $("avisos"); a.textContent = "";
    if (estado.semConexao) a.append(el("div", { "class": "faixa-aviso", text: "Sem conexão com o portal agora. Os dados podem estar desatualizados; a página tenta de novo sozinha." }));
    if (emArke()) {
      var novos = listaPedidos().filter(function (x) { return !x.d.cancelado && etapaDe(x.id) === "recebido"; }).length;
      if (novos) a.append(el("div", { "class": "faixa-aviso", text: novos + (novos === 1 ? " pedido novo aguardando produção." : " pedidos novos aguardando produção.") }));
    }
  }

  var FILTROS = [
    { k: "todos", n: "Todos" },
    { k: "andamento", n: "Em andamento", f: function (s) { return s === "recebido" || s === "producao" || s === "pronto"; } },
    { k: "enviado", n: "Enviados", f: function (s) { return s === "enviado"; } },
    { k: "entregue", n: "Entregues", f: function (s) { return s === "entregue"; } }
  ];
  function renderChips() {
    var c = $("chips"); c.textContent = "";
    var todos = listaPedidos().filter(function (x) { return !x.d.cancelado; });
    FILTROS.forEach(function (f) {
      var q = f.f ? todos.filter(function (x) { return f.f(etapaDe(x.id)); }).length : todos.length;
      c.append(el("button", { type: "button", "aria-pressed": String(estado.filtro === f.k), onclick: function () { estado.filtro = f.k; renderChips(); renderLista(); } }, f.n, el("b", { text: q })));
    });
  }

  function cartao(x, i) {
    var d = x.d, k = etapaDe(x.id), r = estado.producao.get(x.id) || {}, t = TIPOS[d.tipo] || TIPOS.trofeu;
    var novo = !estado.vistos.has(x.id);
    estado.vistos.add(x.id);
    var c = el("article", { "class": "vidro cartao" + (d.cancelado ? " cancelado" : "") + (novo ? " entrada" : ""), style: "--c:" + t.cor + ";--i:" + i, tabindex: "0", "aria-label": "Pedido de " + txt(d.nome) });
    var abrir = function () { abrirGaveta(x.id); };
    c.addEventListener("click", function (e) { if (!e.target.closest("button")) abrir(); });
    c.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target === c) { e.preventDefault(); abrir(); } });
    var quem = el("div", { "class": "quem" }, el("strong", { text: txt(d.nome) }), el("small", { text: t.nome + (txt(d.codigo) ? " · " + txt(d.codigo) : "") }));
    var cab = el("div", { "class": "cabeca" }, medalhao(d.tipo), quem);
    if (emArke() && k === "recebido" && !d.cancelado) cab.append(el("span", { "class": "novo", text: "Novo" }));
    c.append(cab);
    if (!d.cancelado) c.append(trilha(k));
    var pe = el("div", { "class": "pe" }, pilula(k, d.cancelado));
    if (!d.cancelado && txt(r.rastreio) && (k === "enviado" || k === "entregue")) {
      pe.append(el("span", { "class": "rastreio-mini" }, "Rastreio ", el("code", { text: txt(r.rastreio) })));
    } else if (emArke() && !d.cancelado && IDX[k] < 2) {
      var prox = ETAPAS[IDX[k] + 1];
      pe.append(el("button", { "class": "botao pequeno fantasma", type: "button", text: "Mover para " + prox.n, onclick: function (e) { e.stopPropagation(); salvarProducao(x.id, { status: prox.k }, e.currentTarget); } }));
    } else if (emArke() && !d.cancelado && k === "pronto") {
      pe.append(el("button", { "class": "botao pequeno fantasma", type: "button", text: "Lançar rastreio", onclick: function (e) { e.stopPropagation(); abrir(); } }));
    } else if (!d.cancelado && txt(r.previsao) && k !== "entregue") {
      pe.append(el("span", { "class": "rastreio-mini", text: "Previsão " + soData(r.previsao) }));
    }
    c.append(pe);
    return c;
  }

  function cartaoExemplo() {
    var c = el("article", { "class": "vidro cartao exemplo", style: "--c:var(--ouro)", "aria-label": "Exemplo de pedido" });
    c.append(el("span", { "class": "selo-exemplo", text: "Exemplo" }));
    c.append(el("div", { "class": "cabeca" }, medalhao("ouro"), el("div", { "class": "quem" }, el("strong", { text: "Nome do vencedor" }), el("small", { text: "Medalha de ouro · DN2611-01" }))));
    c.append(trilha("producao"));
    c.append(el("div", { "class": "pe" }, pilula("producao"), el("span", { "class": "rastreio-mini", text: "O rastreio aparece aqui" })));
    return c;
  }

  function renderLista() {
    var l = $("lista"); l.textContent = "";
    var todos = listaPedidos();
    if (!estado.carregou) { l.append(el("div", { "class": "vidro vazio" }, el("div", null, el("h3", { text: "Carregando pedidos" }), el("p", { text: "Só um instante." })))); return; }
    if (!todos.length) {
      var texto = emArke() ? "Nenhum pedido ainda" : "Lance o primeiro vencedor";
      var sub = emArke() ? "Quando o Denny lançar os vencedores do mês, eles aparecem aqui para você colocar em produção." : "Envie os dados do vencedor e o tipo de prêmio. A ARKE atualiza a produção e o rastreio aqui mesmo.";
      l.append(el("div", { "class": "vidro vazio" }, el("div", null, el("h3", { text: texto }), el("p", { text: sub })), cartaoExemplo()));
      return;
    }
    var f = FILTROS.filter(function (x) { return x.k === estado.filtro; })[0];
    var q = estado.busca.toLowerCase();
    var vis = todos.filter(function (x) {
      var s = etapaDe(x.id);
      if (f && f.f && (x.d.cancelado || !f.f(s))) return false;
      if (q) {
        var r = estado.producao.get(x.id) || {};
        var alvo = [x.d.nome, x.d.codigo, x.d.gravacao, r.rastreio].map(txt).join(" ").toLowerCase();
        if (alvo.indexOf(q) < 0) return false;
      }
      return true;
    });
    if (!vis.length) { l.append(el("div", { "class": "vidro vazio" }, el("div", null, el("h3", { text: "Nada por aqui" }), el("p", { text: "Nenhum pedido combina com esse filtro ou busca." })))); return; }
    var grupos = {};
    vis.forEach(function (x) { var m = mesValido(txt(x.d.mes)) || "0000-00"; (grupos[m] = grupos[m] || []).push(x); });
    Object.keys(grupos).sort().reverse().forEach(function (m) {
      var g = grupos[m];
      var titulo = m === "0000-00" ? "Sem mês" : (function () { var n = nomeMes(m); return n.mes + " " + n.ano; })();
      var grade = el("div", { "class": "grade" });
      g.forEach(function (x, i) { grade.append(cartao(x, i)); });
      l.append(el("section", { "class": "mes-grupo" }, el("header", null, el("h3", { text: titulo }), el("span", { text: g.length + (g.length === 1 ? " pedido" : " pedidos") })), grade));
    });
  }

  /* ---------- gaveta do pedido ---------- */
  var ultimoFoco = null;
  function abrirGaveta(id) {
    ultimoFoco = document.activeElement;
    estado.aberto = id; estado.sujo = false; renderGaveta();
    $("veu").classList.add("aberto"); $("gaveta").classList.add("aberta"); $("gaveta").setAttribute("aria-hidden", "false");
    setTimeout(function () { $("gaveta").querySelector(".fechar").focus(); }, 60);
  }
  function fecharTudo(forcar) {
    if (!forcar && estado.sujo && estado.aberto) {
      var b = $("gaveta-corpo").querySelector("[data-confirmar-saida]");
      if (b && b.hidden) { b.hidden = false; b.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    }
    estado.aberto = null; estado.sujo = false;
    $("veu").classList.remove("aberto"); $("gaveta").classList.remove("aberta"); $("gaveta").setAttribute("aria-hidden", "true");
    $("modal").classList.remove("aberto"); $("modal").setAttribute("aria-hidden", "true");
    if (ultimoFoco && ultimoFoco.focus && ultimoFoco.isConnected) ultimoFoco.focus();
  }

  function renderGaveta() {
    var id = estado.aberto, d = estado.pedidos.get(id);
    var corpo = $("gaveta-corpo"); corpo.textContent = "";
    if (!d) { corpo.append(el("p", { text: "Este pedido não existe mais." })); return; }
    var k = etapaDe(id), r = estado.producao.get(id) || {}, t = TIPOS[d.tipo] || TIPOS.trofeu;
    $("gaveta-titulo").textContent = (txt(d.codigo) || "Pedido") + (mesValido(txt(d.mes)) ? " · " + (function () { var n = nomeMes(d.mes); return n.mes + " " + n.ano; })() : "");

    corpo.append(el("div", { "class": "heroi-pedido" }, medalhao(d.tipo, true), el("div", null, el("h2", { text: txt(d.nome) }), el("p", { text: t.nome }))));
    if (d.cancelado) corpo.append(el("div", { "class": "faixa-aviso", text: "Pedido cancelado" + (d.canceladoEm ? " em " + soData(d.canceladoEm) : "") + "." }));
    else corpo.append(el("div", { "class": "bloco" }, el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap" }, el("h4", { text: "Situação", style: "margin:0;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--tinta-2)" }), pilula(k)), trilha(k)));

    if (txt(r.rastreio) || ((k === "enviado" || k === "entregue") && txt(r.transportadora))) {
      var link = linkRastreio(r);
      var caixa = el("div", { "class": "caixa-rastreio" }, el("span", { "class": "rotulo", text: "Rastreio" + (txt(r.transportadora) ? " · " + txt(r.transportadora) : "") }));
      if (txt(r.rastreio)) caixa.append(el("span", { "class": "codigo", text: txt(r.rastreio) }));
      var lb = el("div", { "class": "linha-botoes" });
      if (txt(r.rastreio)) lb.append(el("button", { "class": "botao pequeno", type: "button", text: "Copiar código", onclick: function (e) {
        var b = e.currentTarget;
        try { navigator.clipboard.writeText(txt(r.rastreio)).then(function () { b.textContent = "Copiado"; setTimeout(function () { b.textContent = "Copiar código"; }, 1800); }, function () { aviso("Não deu para copiar. Selecione o código e copie.", true); }); }
        catch (err) { aviso("Não deu para copiar. Selecione o código e copie.", true); }
      } }));
      if (link) lb.append(el("a", { "class": "botao pequeno fantasma", href: link, target: "_blank", rel: "noopener", text: "Abrir rastreio" }));
      caixa.append(lb);
      if (txt(r.previsao) && k !== "entregue") caixa.append(el("span", { style: "font-size:14px;color:var(--tinta-2)", text: "Previsão de entrega: " + soData(r.previsao) }));
      corpo.append(caixa);
    } else if (txt(r.previsao) && !d.cancelado) {
      corpo.append(el("div", { "class": "bloco" }, el("h4", { text: "Previsão de entrega" }), el("p", { text: soData(r.previsao) })));
    }
    if (txt(r.recado)) corpo.append(el("div", { "class": "bloco" }, el("h4", { text: "Recado da ARKE" }), el("div", { "class": "recado", text: txt(r.recado) })));

    if (emArke() && !d.cancelado) corpo.append(painelArke(id, k, r));

    var dl = el("dl", { "class": "dados" });
    function linha(n, v) { if (txt(v)) dl.append(el("dt", { text: n }), el("dd", { text: txt(v) })); }
    linha("Prêmio", t.nome); linha("Vencedor", d.nome); linha("Gravação", d.gravacao); linha("Contato", d.contato); linha("Observações", d.obs);
    corpo.append(el("div", { "class": "bloco" }, el("h4", { text: "Dados do vencedor" }), dl));
    var end = [txt(d.destinatario), [txt(d.rua), txt(d.complemento)].filter(Boolean).join(", "), [txt(d.bairro), [txt(d.cidade), txt(d.uf).toUpperCase()].filter(Boolean).join(" / ")].filter(Boolean).join(" · "), txt(d.cep) ? "CEP " + txt(d.cep) : ""].filter(Boolean).join("\n");
    if (end) corpo.append(el("div", { "class": "bloco" }, el("h4", { text: "Entrega" }), el("p", { style: "white-space:pre-line;overflow-wrap:anywhere", text: end })));

    var hist = el("ol", { "class": "linha-tempo" });
    var evs = [];
    if (d.criadoEm) evs.push({ n: "Pedido lançado", em: d.criadoEm, cor: "var(--alerta)" });
    if (d.editadoEm) evs.push({ n: "Dados do vencedor atualizados", em: d.editadoEm, cor: "var(--tinta-2)" });
    (Array.isArray(r.historico) ? r.historico : []).forEach(function (h) { if (h && IDX[h.s] != null) evs.push({ n: ETAPAS[IDX[h.s]].n, em: h.em, cor: ETAPAS[IDX[h.s]].cor, extra: h.s === "enviado" && txt(h.rastreio) ? "Rastreio " + txt(h.rastreio) : "" }); });
    if (d.canceladoEm) evs.push({ n: "Pedido cancelado", em: d.canceladoEm, cor: "var(--erro)" });
    evs.sort(function (a, b) { return txt(b.em).localeCompare(txt(a.em)); });
    evs.forEach(function (e) { hist.append(el("li", { style: "--s:" + e.cor }, el("b", { text: e.n }), el("small", { text: dataHora(e.em) + (e.extra ? " · " + e.extra : "") }))); });
    corpo.append(el("div", { "class": "bloco" }, el("h4", { text: "Histórico" }), hist));

    if (!d.cancelado && k === "recebido") {
      var conf = el("div", { hidden: true, style: "display:flex;gap:8px;flex-wrap:wrap;align-items:center" },
        el("span", { style: "font-size:14px;color:#FFD3D9", text: "Cancelar este pedido?" }),
        el("button", { "class": "botao pequeno perigo", type: "button", text: "Sim, cancelar", onclick: function (e) { cancelarPedido(id, e.currentTarget); } }),
        el("button", { "class": "botao pequeno fantasma", type: "button", text: "Voltar", onclick: function () { conf.hidden = true; acoes.hidden = false; } }));
      var acoes = el("div", { style: "display:flex;gap:8px;flex-wrap:wrap" },
        el("button", { "class": "botao pequeno fantasma", type: "button", text: "Editar dados", onclick: function () { abrirForm(id); } }),
        el("button", { "class": "botao pequeno perigo", type: "button", text: "Cancelar pedido", onclick: function () { acoes.hidden = true; conf.hidden = false; } }));
      corpo.append(el("div", { "class": "bloco" }, el("h4", { text: "Ajustes" }), el("p", { style: "font-size:14px;color:var(--tinta-2)", text: "Dá para corrigir ou cancelar até a peça entrar em produção." }), acoes, conf));
    }
  }

  function painelArke(id, k, r) {
    var sel = k;
    var bloco = el("form", { "class": "bloco", style: "border-color:rgba(124,240,255,.35);background:rgba(42,123,255,.08)", novalidate: true });
    bloco.append(el("h4", { text: "Atualizar para o Denny" }));
    var etapas = el("div", { "class": "etapas", role: "group", "aria-label": "Etapa do pedido" });
    var envio;
    ETAPAS.forEach(function (e) {
      etapas.append(el("button", { type: "button", "aria-pressed": String(e.k === sel), text: e.n, onclick: function (ev) {
        sel = e.k; if (sel !== k) estado.sujo = true;
        Array.prototype.forEach.call(etapas.children, function (b) { b.setAttribute("aria-pressed", String(b === ev.currentTarget)); });
        envio.hidden = IDX[sel] < 3;
      } }));
    });
    bloco.append(etapas);
    var transp = el("select", { id: "a-transp" }); transp.append(el("option", { value: "", text: "Escolha" }));
    TRANSPORTES.forEach(function (n) { transp.append(el("option", { value: n, text: n, selected: txt(r.transportadora) === n })); });
    envio = el("div", { style: "display:grid;gap:12px" },
      el("div", { "class": "duas" },
        el("div", { "class": "campo" }, el("label", { "for": "a-transp", text: "Transportadora" }), transp),
        el("div", { "class": "campo" }, el("label", { "for": "a-rastreio", text: "Código de rastreio" }), el("input", { id: "a-rastreio", value: txt(r.rastreio), maxlength: "60", autocomplete: "off", placeholder: "AA123456789BR" }))),
      el("div", { "class": "campo" }, el("label", { "for": "a-link", text: "Link de rastreio (opcional)" }), el("input", { id: "a-link", type: "url", value: txt(r.link), maxlength: "500", placeholder: "https://" })));
    envio.hidden = IDX[sel] < 3;
    bloco.append(envio);
    bloco.append(el("div", { "class": "campo" }, el("label", { "for": "a-prev", text: "Previsão de entrega" }), el("input", { id: "a-prev", type: "date", value: /^\d{4}-\d{2}-\d{2}$/.test(txt(r.previsao)) ? r.previsao : "" })));
    bloco.append(el("div", { "class": "campo" }, el("label", { "for": "a-recado", text: "Recado para o Denny (opcional)" }), el("textarea", { id: "a-recado", maxlength: "600", text: txt(r.recado), placeholder: "Ex.: arte aprovada, saindo na sexta." })));
    var erro = el("p", { "class": "erro-form", role: "alert", hidden: true });
    var saida = el("p", { "data-confirmar-saida": "", hidden: true, style: "font-size:14px;color:#FFE2C2", text: "Você tem alterações sem salvar. Feche de novo para descartar." });
    var btn = el("button", { "class": "botao", type: "submit", text: "Salvar e avisar o Denny" });
    bloco.append(erro, saida, btn);
    bloco.addEventListener("input", function () { estado.sujo = true; });
    bloco.addEventListener("submit", function (e) {
      e.preventDefault(); erro.hidden = true;
      var dados = {
        status: sel, transportadora: transp.value,
        rastreio: $("a-rastreio").value.trim().toUpperCase(), link: $("a-link").value.trim(),
        previsao: $("a-prev").value, recado: $("a-recado").value.trim()
      };
      if (IDX[sel] >= 3 && !dados.transportadora) { erro.textContent = "Escolha a transportadora para marcar como enviado."; erro.hidden = false; return; }
      if (IDX[sel] >= 3 && /^(Correios|Jadlog|Transportadora)$/.test(dados.transportadora) && !dados.rastreio) { erro.textContent = "Coloque o código de rastreio para o Denny acompanhar."; erro.hidden = false; return; }
      if (dados.link && !/^https?:\/\//i.test(dados.link)) { erro.textContent = "O link de rastreio precisa começar com https://"; erro.hidden = false; return; }
      salvarProducao(id, dados, btn);
    });
    return bloco;
  }

  /* ---------- escrita ---------- */
  function salvarProducao(id, dados, botao) {
    var antes = etapaDe(id);
    if (botao) { botao.disabled = true; botao.dataset.t = botao.textContent; botao.textContent = "Salvando…"; }
    chamar("producao", { id: id, dados: dados }).then(function () {
      estado.sujo = false;
      var agora = etapaDe(id);
      aviso(agora !== antes ? "Pedido movido para " + ETAPAS[IDX[agora]].n + "." : "Atualização salva.");
      render();
    }, function (e) { aviso(textoErro(e), true); })
      .finally(function () { if (botao && botao.isConnected) { botao.disabled = false; botao.textContent = botao.dataset.t; } });
  }
  function cancelarPedido(id, botao) {
    botao.disabled = true;
    chamar("cancelar", { id: id }).then(function () { aviso("Pedido cancelado."); }, function (e) { aviso(textoErro(e), true); botao.disabled = false; });
  }

  /* ---------- formulário ---------- */
  var CAMPOS = ["nome", "mes", "gravacao", "contato", "destinatario", "cep", "rua", "complemento", "bairro", "cidade", "uf", "obs"];
  var OBRIG = ["nome", "mes", "destinatario", "cep", "rua", "cidade", "uf"];
  var ENDERECO = ["destinatario", "cep", "rua", "complemento", "bairro", "cidade", "uf"];
  function montarPremios() {
    var p = $("premios");
    ORDEM_TIPOS.forEach(function (k) {
      var t = TIPOS[k];
      p.append(el("div", { "class": "premio-opcao", style: "--c:" + t.cor },
        el("input", { type: "radio", name: "tipo", id: "f-tipo-" + k, value: k }),
        el("label", { "for": "f-tipo-" + k }, medalhao(k), el("span", { text: t.nome }))));
    });
  }
  function ultimoEndereco(exceto) {
    var l = listaPedidos().filter(function (x) { return x.id !== exceto && txt(x.d.rua); });
    return l.length ? l[l.length - 1].d : null;
  }
  function abrirForm(editId) {
    ultimoFoco = document.activeElement;
    estado.editando = editId || null;
    var f = $("form"); f.reset(); $("erro-form").hidden = true;
    Array.prototype.forEach.call(f.querySelectorAll(".invalido"), function (c) { c.classList.remove("invalido"); });
    var d = editId ? estado.pedidos.get(editId) : null;
    if (d) {
      CAMPOS.forEach(function (c) { var i = f.elements[c]; if (i) i.value = txt(d[c]); });
      var r = $("f-tipo-" + d.tipo); if (r) r.checked = true;
    } else {
      $("f-mes").value = estado.mesFoco;
    }
    $("usar-endereco").hidden = !!d || !ultimoEndereco();
    $("modal-titulo").textContent = d ? "Editar pedido" : emArke() ? "Novo pedido" : "Lançar vencedor";
    $("btn-salvar").textContent = d ? "Salvar alterações" : emArke() ? "Criar pedido" : "Enviar para a ARKE";
    if (estado.aberto) { $("gaveta").classList.remove("aberta"); $("gaveta").setAttribute("aria-hidden", "true"); estado.aberto = null; }
    $("veu").classList.add("aberto"); $("modal").classList.add("aberto"); $("modal").setAttribute("aria-hidden", "false");
    setTimeout(function () { (d ? $("f-nome") : $("f-tipo-trofeu")).focus(); }, 80);
  }
  $("usar-endereco").addEventListener("click", function () {
    var d = ultimoEndereco(estado.editando); if (!d) return;
    ENDERECO.forEach(function (c) { $("form").elements[c].value = txt(d[c]); });
    aviso("Endereço do último pedido preenchido.");
  });
  $("f-cep").addEventListener("input", function (e) {
    var v = e.target.value.replace(/\D/g, "").slice(0, 8);
    e.target.value = v.length > 5 ? v.slice(0, 5) + "-" + v.slice(5) : v;
  });
  $("f-uf").addEventListener("input", function (e) { e.target.value = e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase(); });
  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, erro = $("erro-form"); erro.hidden = true;
    var dados = {}; CAMPOS.forEach(function (c) { dados[c] = f.elements[c].value.trim(); });
    dados.uf = dados.uf.toUpperCase();
    var tipo = f.querySelector("input[name=tipo]:checked");
    var faltando = [];
    Array.prototype.forEach.call(f.querySelectorAll(".campo"), function (c) { c.classList.remove("invalido"); });
    OBRIG.forEach(function (c) { if (!dados[c]) { faltando.push(c); f.elements[c].closest(".campo").classList.add("invalido"); } });
    if (dados.cep && dados.cep.replace(/\D/g, "").length !== 8) { faltando.push("cep"); $("f-cep").closest(".campo").classList.add("invalido"); }
    if (dados.mes && !mesValido(dados.mes)) { faltando.push("mes"); $("f-mes").closest(".campo").classList.add("invalido"); }
    if (!tipo) { erro.textContent = "Escolha o prêmio: troféu ou medalha de ouro, prata ou bronze."; erro.hidden = false; return; }
    if (faltando.length) { erro.textContent = "Preencha os campos marcados para a ARKE produzir e entregar a peça."; erro.hidden = false; var p = f.querySelector(".invalido input"); if (p) p.focus(); return; }
    dados.tipo = tipo.value;
    salvarPedido(dados);
  });
  function salvarPedido(dados) {
    var btn = $("btn-salvar"); btn.disabled = true; var rot = btn.textContent; btn.textContent = "Enviando…";
    var editou = !!estado.editando;
    chamar(editou ? "editar" : "criar", { id: estado.editando, dados: dados }).then(function () {
      fecharTudo(true);
      estado.mesFoco = dados.mes;
      render();
      aviso(editou ? "Pedido atualizado." : emArke() ? "Pedido criado." : "Vencedor enviado para a ARKE.");
    }, function (e) { var er = $("erro-form"); er.textContent = textoErro(e); er.hidden = false; })
      .finally(function () { btn.disabled = false; btn.textContent = rot; });
  }

  /* ---------- eventos gerais ---------- */
  $("btn-novo").addEventListener("click", function () { abrirForm(null); });
  $("mes-ant").addEventListener("click", function () { estado.mesFoco = somaMes(estado.mesFoco, -1); renderAbertura(); renderPlacar(); });
  $("mes-prox").addEventListener("click", function () { estado.mesFoco = somaMes(estado.mesFoco, 1); renderAbertura(); renderPlacar(); });
  $("busca").addEventListener("input", function (e) { estado.busca = e.target.value.trim(); renderLista(); });
  $("veu").addEventListener("click", function () { fecharTudo(); });
  Array.prototype.forEach.call(document.querySelectorAll("[data-fechar]"), function (b) { b.addEventListener("click", function () { fecharTudo(); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && (estado.aberto || $("modal").classList.contains("aberto"))) fecharTudo(); });
  $("alternar").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-modo]"); if (!b) return;
    estado.modo = b.dataset.modo; gravarLocal(CHAVE + "-modo", estado.modo);
    render();
  });

  var luz = document.querySelector(".luz");
  if (window.matchMedia && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.addEventListener("pointermove", function (e) {
      luz.style.opacity = "1"; luz.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
      var v = e.target.closest && e.target.closest(".vidro");
      if (v) { var r = v.getBoundingClientRect(); v.style.setProperty("--mx", (e.clientX - r.left) + "px"); v.style.setProperty("--my", (e.clientY - r.top) + "px"); }
    }, { passive: true });
  }

  /* ---------- início ---------- */
  montarPremios();
  var salva = lerLocal(CHAVE);
  if (salva && API_URL) {
    $("entrar").hidden = true; $("area-portal").hidden = false; $("btn-sair").hidden = false;
    render();
    chamar("listar", null, salva).then(function (res) {
      estado.senha = salva;
      estado.modo = res.papel === "arke" ? (lerLocal(CHAVE + "-modo") === "cliente" ? "cliente" : "arke") : "cliente";
      render();
    }, function (e) {
      if (e && e.erro === "rede") { estado.senha = salva; estado.semConexao = true; render(); }
      else { gravarLocal(CHAVE, null); mostrarEntrada(textoErro(e)); }
    });
  } else {
    mostrarEntrada("");
  }
})();
