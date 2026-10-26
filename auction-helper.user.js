// ==UserScript==
// @name         Noni's DIY Auction Helper
// @namespace    HV Forum Tools
// @version      0.7.23
// @description  Making the Noni's Auction a little more friendly :)
// @author       sparroff (original), SIRIUSs (current), CornerCactus (contributor)
// @match        https://forums.e-hentai.org/*showtopic*
// @icon         https://forums.e-hentai.org/favicon.ico
// @grant        GM.addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_setClipboard
// @updateURL    https://raw.githubusercontent.com/TetsuOrb/nonis-diy-auction-helper/main/auction-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/TetsuOrb/nonis-diy-auction-helper/main/auction-helper.user.js
// ==/UserScript==

/*
 * Noni's DIY Auction Helper
 * ------------------------------------------------------------------
 * Patch: Minor change to regex
 *
 * Release/Patch Notes:
 * Horizontal tab character is now recognized.
 */

const SHOWTOPIC = new URLSearchParams(window.location.search).get('showtopic');
const FIRST_POST_REGEX = new RegExp("\\[(.*?)\\](.*?)\\((?:current:|start:)(.*?)(\\d+(?:\\.\\d+){0,})([kKmMbBtT])", '');
const ssPref = 'hvAuc~';

let refresh_loop=false;

let TRACKS = GM_getValue(SHOWTOPIC,[]);
let LOT_IN_POST={};
let NEED_NEXT_UPDATE = true;
let LOT_LINKS;
let AuctionStarted = false

let timers_element = [];

let bids_log = [];
let bids_lose = [];

let my_nick = GM_getValue("mynick","");

function refresh_timers(){
    if(timers_element){
        timers_element.forEach((el) => {
            if(document.getElementById(el)){
                let current = document.getElementById(el);
                let inner = convert_ms_to_time(current);
                current.innerHTML=inner;
                if(inner.indexOf('END')!=-1 || inner.indexOf('WAIT')!=-1){
                    if(current.parentNode.querySelector('.NAE_bid_single')){
                        current.parentNode.querySelector('.NAE_bid_single').classList.remove('NAE_bid_single');
                    }
                    timers_element = timers_element.filter(function(e) { return e !== el });
                }
            } else {
                timers_element = timers_element.filter(function(e) { return e !== el });
            }
        })
    }
}

function add_timer(el){
    if(timers_element.indexOf(el)==-1) timers_element.push(el);
}

function timers(){
    setInterval(() => {
        refresh_timers();
    }, 1000);
}

function refreshloop(){
    setInterval(() => {
        if(refresh_loop && TRACKS.length>0) refresh_track();
    }, 5*60*1000);
}



(function() {
    if(!(location.href.includes("showtopic") && document.title.includes("DIY") && document.title.includes("Auction"))) return;
    let firstposts = [...document.querySelectorAll('.borderwrap')].filter(function( post ) {return post.querySelector('.postdetails')!=null});
    let topicstarter = ""
    for(let i=0;i<firstposts.length;i++){
        if(i==0) {
            topicstarter = firstposts[i].querySelector('.bigusername').innerText
            if(firstposts[i].querySelectorAll('.postdetails')[0].querySelector('a').innerText != '#1') break;
        }
        if(firstposts[i].querySelector('.bigusername').innerText != topicstarter) break
        Object.assign(LOT_IN_POST, get_all_lots(firstposts[i].querySelector('div[id^="post-"').innerText.split('\n')))
        format_post(firstposts[i], LOT_IN_POST);
    }
    get_lot_links();
    create_menu();
    refresh_track();
    timers();
    initProxyBidListener();
    refreshloop();
})();

function create_menu(){
    let mynick = GM_getValue("mynick","");
    let all_bid_key="";
    if(mynick!="") all_bid_key='<button id="NAE_bid_all" class="button NAE_button">Bid All</button>';
    document.querySelector('.tablebg').insertAdjacentHTML("beforeend", `
    <div class="tablebg" id='NAE_menu'>
    <div class="maintitle" id="NAE_menu_opener"><span>Noni's DIY Auction helper</span></div>
    <div id="NAE_bid_alert">!</div>
    <div id="NAE_menu_header">
        <div id="NAE_menu_section1">
            <input type="text" id="NAE_mynick" value="${mynick}" placeholder="my nickname" readonly>${all_bid_key}</input>
        </div>
        <div id="NAE_menu_section2"><button id="NAE_refresh_button" class="button NAE_button">Refresh</button></div>
        <div id="NAE_menu_section3"><span id="NAE_auction_end" data-place="auction">00:00:00</span></div>
    </div>
    <div id="NAE_table_wrapper"></div>
    <span id="helper_version">v${GM_info.script.version}</span>
    </div>
    `)
    document.querySelector('#NAE_refresh_button').addEventListener("click", refresh_track);
    document.querySelector('#NAE_menu_opener').addEventListener("click", slide_menu);

    document.querySelector('#NAE_mynick').addEventListener('change', ()=>{
        GM_setValue("mynick", document.querySelector('#NAE_mynick').value);
    })
    document.querySelector('#NAE_mynick').addEventListener('click', async ()=>{
        await setUsername();
    })

    if(document.querySelector('#NAE_mynick').value != ''){
        const btn = document.querySelector('#NAE_bid_all')
        btn.addEventListener("click", () => bid_all(false) );
        btn.addEventListener("contextmenu", (e) => { e.preventDefault(); bid_all(true) } );
    }

    if(document.querySelector('#NAE_notyfication')){
        if(GM_getValue("notyfication", false)) document.querySelector('#NAE_notyfication').checked = true;
        document.querySelector('#NAE_notyfication').addEventListener('change', ()=>{
            GM_setValue("notyfication", document.querySelector('#NAE_notyfication').checked);
        })
    }

    if(GM_getValue("menu_open",false)) slide_menu(true);

    if(!checkTimeZone()){
        document.querySelector('#NAE_menu_header').insertAdjacentHTML('beforebegin','<a class="NAE_timezone_link" href="https://forums.e-hentai.org/index.php?act=UserCP&CODE=04"><div id="NAE_timezone_alert">The time zone on the forum does not match yours! Fix it!</div></a>')
    }
}

function bid_all(copy){
    let all_btn = document.querySelectorAll('.NAE_bid_single');
    let all_bids = [];
    all_btn.forEach((btn) => {
        if(btn.parentNode.querySelector('.NAE_poster_notme')) all_bids.push(calculate_inc_bid(btn));
    })
    if(all_bids.length>0){
        let paste = all_bids.join("\n");
        copy ? GM_setClipboard(paste) : post_bid(paste);
    }
}

function bid_single(el, copy){
    if(!el.classList.contains('NAE_bid_single') || !el.parentNode.querySelector('.NAE_poster_notme') ) return
    const text = calculate_inc_bid(el)
    copy ? GM_setClipboard(text) : post_bid(text)
}

function post_bid(str){
    const el = document.querySelector('#fastreplyarea')
    el.value = str.includes('\n') ? str : el.value + (el.value.length > 0 ? '\n' : '') + str;
    document.querySelector('#qr_open').style.display = 'block'
    document.body.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
}


function get_lot_links(){
    LOT_LINKS = {}
    if (!location.href.endsWith(SHOWTOPIC) ) {
        const raw = sessionStorage.getItem(ssPref + SHOWTOPIC + '_lot_links')
        if (raw) LOT_LINKS = JSON.parse(raw)
        return
    }

    const links = document.querySelectorAll('a[href*="/equip/"]');

    // Regex for the immediate preceding text node:
    const re = /\[([a-z0-9_]+)\]\s?$/i;

    links.forEach(link => {
        const prevNode = link.previousSibling
        if (prevNode && prevNode.nodeType === Node.TEXT_NODE) {
            const match = prevNode.textContent.match(re)
            if (match) {
                LOT_LINKS[match[1]] = link.getAttribute('href')
            }
        }
    })
    sessionStorage.setItem(ssPref + SHOWTOPIC + '_lot_links', JSON.stringify(LOT_LINKS) )
}


function slide_menu(st=false){
    if(!document.querySelector('#NAE_menu').classList.contains("open_menu") || st==true){
        document.querySelector('#NAE_menu').classList.add("open_menu");
        GM_setValue("menu_open", true)
    }
    else{
        document.querySelector('#NAE_menu').classList.remove("open_menu");
        GM_setValue("menu_open", false)
    }
}

function get_all_lots(inner){
    let inner_array = inner;
    let array_lots=[];
    inner_array.forEach((inner_string) => {
        if(FIRST_POST_REGEX.test(inner_string)) array_lots.push(inner_string);
    })
    let object_lots={}
    array_lots.forEach((lot) => {
        let current = FIRST_POST_REGEX.exec(lot);
        if(current == null) return;
        if(current[1] == "Snowflake01") return;
        object_lots[current[1]] = {id:current[1],name:current[2].trim(),seller:current[3].trim(),price:current[4].trim()};
    })
    return object_lots;
}

function format_post(post, obj){
    let inner_post = post.innerHTML;
    for (let key in obj) {
        let _class = TRACKS.indexOf(key) != -1 ? "yestrack" : "";
        inner_post = inner_post.replace(`[${key}]`,`<span class="NAE_lot ${_class}" id="lot_${key}"> </span>[${key}]`);
    }
    post.innerHTML = inner_post;

    post.querySelectorAll('.NAE_lot').forEach((btn) => {
        btn.addEventListener("click", function (){track_lot(this)})
    })
}

function track_lot(e){
    let track_lots = GM_getValue(SHOWTOPIC, []);
    let track_names = GM_getValue(`${SHOWTOPIC}_names`, {});
    let l_id = e.id.replace('lot_','')
    if(track_lots.indexOf(l_id)==-1){
        track_lots.push(l_id.toLowerCase());
        e.classList.add("yestrack")
        track_names[l_id]=LOT_IN_POST[l_id]["name"]
    }
    else{
        track_lots = track_lots.filter(function(el) { return el !== l_id })
        e.classList.remove("yestrack")
        delete track_names[l_id]
    }
    GM_setValue(SHOWTOPIC, track_lots)
    GM_setValue(`${SHOWTOPIC}_names`, track_names)
    TRACKS = track_lots

    if(NEED_NEXT_UPDATE){
        NEED_NEXT_UPDATE = false
        setTimeout(refresh_track, 500)
    }
}

function get_datas(post) {
    let timers = post.querySelectorAll('img[src^="https://pure-svg-countdown.skk.moe"]');
    if (!timers || timers.length < 2) {
        console.error("Failed to retrieve timer elements.");
        return null;
    }
    return {
        "start": get_date_in_ms(timers[0].src),
        "end": get_date_in_ms(timers[1].src)
    };
}

function get_date_in_ms(urlStr) {
    try {
        const url = new URL(urlStr);
        const timeParam = url.searchParams.get('time');
        if (!timeParam) return null;
        return Math.floor(new Date(timeParam).getTime());
    } catch (e) {
        console.error("Error parsing time:", e);
        return null;
    }
}

function convert_ms_to_time(el, offset=900){
    let ms = el.dataset.end_time - Date.now();

    if(ms <= 0) return `<span class="NAE_timer_end">END</span>`;

    let seconds = Math.round(ms / 1000) - 1;
    const hours = parseInt( seconds / 3600 );
    seconds = seconds % 3600;
    const minutes = parseInt( seconds / 60 );
    seconds = seconds % 60;

    let ret_str = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(Math.round(seconds)).padStart(2, '0')}`;
    let min_str = `${String(minutes).padStart(2, '0')}:${String(Math.round(seconds)).padStart(2, '0')}`;

    if(el.dataset.place == "bid"){
        if(Math.round(ms/1000) <= 900 && el.dataset.end_time != document.querySelector('#NAE_auction_end').dataset.end_time) {
            return `<span class="NAE_bid_limit">${min_str}</span>`;
        } else {
            return `<span class="NAE_timer_hide"></span>`;
        }
    }

    if(el.dataset.place == "auction"){
        let auctionEndEl = document.querySelector('#NAE_auction_end');
        if (auctionEndEl && Date.now() < auctionEndEl.dataset.start_time) {
            return `<span class="NAE_timer_end">waiting start</span>`;
        }
        AuctionStarted = true
    }

    return `<span>${ret_str}</span>`;
}

function convert_post_data(str){
    if(!/Today|Yesterday/i.test(str)) return new Date(str).getTime();

    let [date, time] = str.split(', ');
    let [h,m] = time.split(':');
    let ret = new Date();
    if(date.includes('Today')){
        ret.setHours(h,m,0);
        return ret.getTime();
    } else if(date.includes('Yesterday')){
        ret.setDate(ret.getDate()-1);
        ret.setHours(h,m,0);
        return ret.getTime();
    } else{
        alert(`Date parsing error: ${str}`);
        return undefined;
    }
}

function set_auction_timer(post){
    let auc_times = get_datas(post);

    document.querySelector('#NAE_auction_end').setAttribute('data-end_time',auc_times.end-1000);
    document.querySelector('#NAE_auction_end').setAttribute('data-start_time',auc_times.start);
    add_timer('NAE_auction_end');
    return auc_times.end-1000;
}

function bid_times_calculate(prev_bid, new_bid){
    let aucend = Number(document.querySelector('#NAE_auction_end').dataset.end_time);
    if(new_bid>=prev_bid) return prev_bid;
    if(new_bid<=aucend-15*60*1000) return prev_bid;
    // Restore the posted end for tier thresholds only; retain adjusted eligibility.
    let posted_end = aucend+1000;
    let duration = new_bid>=posted_end+45*60*1000 ? 2*60*1000 : new_bid>=posted_end+30*60*1000 ? 5*60*1000 : 15*60*1000;
    return new_bid+duration;

}

const parseBid = v => {
    const n = parseFloat(v);
    const m = { k:1e3, m:1e6, b:1e9, t:1e12 }[v.toLowerCase().match(/[kmbt]/)?.[0]] || 1;
    return n * m;
};

const formatBid = n => {
    for (const [s, m] of [['t',1e12], ['b',1e9], ['m',1e6], ['k',1e3]]){
        if (n >= m) return +(n / m).toFixed(2) + s;
    }
    return String(n);
};

async function refresh_track(){
    if(my_nick === '' || my_nick!=GM_getValue("mynick","")) await setUsername();
    document.querySelector('#NAE_table_wrapper').innerHTML="";
    let reg = new RegExp(`(?:(?:^|\\s|\\[)(${TRACKS.join("|")})(?:\\s+|]\\s+)((?:\\d+(?:\\.\\d+)?[kKmMbBtT])|(?:\\d{5,})(?:\\s|$)|[sS]tart))`,"s");
    let start_reg = new RegExp(
        `(?:(?:^|\\s|\\[))(${TRACKS.join("|")}).*?\\([sS]tart:\\s*(\\d+(?:\\.\\d+)?[kKmMbBtT]?)\\)`,
        "s"
    );
    let last_page = 1;
    let end_auction;
    let start_auction;
    let new_bids = {}
    function parse_line(line, poster, time, i, post_id) {
        if(line=="") return;
        let st = start_reg.exec(line.trim().toLowerCase());
        if(st!=null){
            new_bids[st[1]].start = parseBid(st[2].trim());
        }

        let ss = reg.exec(line.trim().toLowerCase());
        if(ss!=null && line.indexOf("hentaiverse.org")==-1){
            if(time<start_auction) return;
            let newp_rice=50000;
            if(ss[2]=="start"){
                newp_rice=new_bids[ss[1]]["start"];
            }
            else{
                if((/k|K|m|m|b|B|t|T/i.test(ss[2]))) newp_rice = parseFloat(ss[2].trim())*Number(ss[2].trim().replace(/[0-9]|\./g, '').replace(/k|K/g, '1000').replace(/m|M/g, '1000000').replace(/b|B/g, '1000000000').replace(/t|T/g, '1000000000000'));
                else newp_rice=parseFloat(ss[2].trim())
            }
            if(time>=new_bids[ss[1]]["time"]) return;
            if(calculate_bid(new_bids[ss[1]]["price"], newp_rice, new_bids[ss[1]]["start"])){
                let close = bid_times_calculate(new_bids[ss[1]]["time"], time);
                let nlog = new_bids[ss[1]].log
                nlog.push(`${(new Date(time).getHours() + "").padStart(2, "0")}:${(new Date(time).getMinutes() + "").padStart(2, "0")}  |   ${Number(newp_rice)/1000}k  -   ${poster}  #${i+1}`)
                new_bids[ss[1]]={"poster":poster, "post_id":post_id, "price":newp_rice, "start":new_bids[ss[1]]["start"], "post_number":i+1, "time":close, "log":nlog};
            }
        }
    }
    await fetch(`https://forums.e-hentai.org/index.php?act=Print&client=printer&f=90&t=${SHOWTOPIC}`)
        .then(function(response) {
        return response.text();
    })
        .then(function(html) {
        let parser = new DOMParser();
        let doc = parser.parseFromString(html, "text/html");
        let all_posts = doc.querySelectorAll(".printpost");
        if (all_posts.length === 300) last_page = 7;

        end_auction = set_auction_timer(all_posts[0]);
        start_auction = parseInt(document.querySelector("#NAE_auction_end").getAttribute('data-start_time'));

        for(let i=0;i<TRACKS.length;i++){
            new_bids[TRACKS[i]]={"poster":"", "post_id":"", "post_number":"", "price":0, "start":50000, "time":end_auction, "log":[]};
        }

        if(TRACKS.length==0){
            new_bids = {};
            refresh_loop = false;
        }
        else{
            for(let i=0;i<all_posts.length;i++){
                if(i<2) continue;
                let post=all_posts[i];
                let poster = /Posted by: (.*?)  /.exec(post.querySelector('h4').innerText)[1];
                let time = convert_post_data(post.querySelector('h4').innerText.split("  ")[1]);
                let post_inner = post.innerHTML.replaceAll('<p>','').replaceAll(/\s+/g,' ').replaceAll("<br>","\n");

                if(!/<!--IBF\.ATTACHMENT_(.*?)-->/.test(post_inner)) return;

                let post_id = /<!--IBF\.ATTACHMENT_(.*?)-->/.exec(post_inner)[1];

                post_inner.split("\n").forEach(line => parse_line(line, poster, time, i, post_id));
            }

            refresh_loop = true;
        }
    })
        .catch(function(err) {
        console.log('Failed to fetch print-page: ', err);
    });

    try {
        for (let page = 6; TRACKS.length && page < last_page; page++) {

            const response = await fetch(
                `https://forums.e-hentai.org/lofiversion/index.php/t${SHOWTOPIC}-${page * 50}.html`
        );

            if (response.status === 429) {
                const wrapper = document.querySelector('#NAE_table_wrapper');

                wrapper.insertAdjacentHTML(
                    'beforeend',
                    `<div style="
        color: red;
        font-weight: bold;
        font-size: 16px;
        margin-top: 10px;
        padding: 8px;
        border: 1px solid red;
        background: rgba(255,0,0,0.08);
    ">
        Rate limit exceeded. Please refresh the page later.
    </div>`
        );
                throw new Error("429 Rate limit");
            }

            const html = await response.text();

            let parser = new DOMParser();
            let doc = parser.parseFromString(html, "text/html");

            last_page = +doc.querySelector('.ipbpagespan a:last-child').innerText;

            doc.querySelectorAll('.postwrapper').forEach((post, i) => {
                let post_number = page * 50 + i;
                let poster = post.querySelector('.postname').innerText;
                let time = convert_post_data(post.querySelector('.postdate').innerText);

                let post_inner = post.querySelector('.postcontent').innerHTML
                .replaceAll('<p>', '')
                .replaceAll('\t', ' ')
                .replaceAll("<br>", "\n");

                post_inner.split("\n").forEach(line =>
                                               parse_line(line, poster, time, post_number)
                                              );
            });
        }

    } catch (err) {
        console.log(`Failed to fetch lo-fi page: `, err);
        return 1
    }
    console.log(new_bids);
    set_auction_menu(new_bids);
}

function calculate_bid(price, current=0, start=50000){
    //if(isNaN(price) || isNaN(current)) return false;
    if(current==0) return true;
    let newm=Math.ceil(price*1.05);
    if(current<start) return false;
    return current>=newm
}

function set_auction_menu(obj){
    NEED_NEXT_UPDATE = true;
    create_table(obj);
}

function create_table(obj){
    let items="";
    let track_names = GM_getValue(`${SHOWTOPIC}_names`, {});
    let me = GM_getValue("mynick","");
    let alert = false;
    let current_time = new Date().getTime();
    let auction_end_time = document.querySelector('#NAE_auction_end').dataset.end_time;
    for(let key in obj) {
        let post_link="";
        if(obj[key]["post_id"]) post_link=`<a href="https://forums.e-hentai.org/index.php?s=&showtopic=${SHOWTOPIC}&view=findpost&p=${obj[key]["post_id"]}"><b>#${obj[key]["post_number"]}</b></a>`;
        else if (obj[key]["poster"]) post_link=`<b>#${obj[key]["post_number"]}</b>`;
        else post_link=`<span>#start</span>`;

        let poster = "";
        if(me=="") poster = obj[key]["poster"];
        else poster = obj[key]["poster"]==me ? `<span class="NAE_poster_me">${obj[key]["poster"]}</span>` : `<span class="NAE_poster_notme">${obj[key]["poster"]}</span>`;

        let time = obj[key]["time"] < auction_end_time ? auction_end_time : obj[key]["time"];
        let nameEl = LOT_LINKS[key] != undefined ? `<a class="NAE_name" target="_blank" href="${LOT_LINKS[key]}">${track_names[key]}</a>` : `<span class="NAE_name" title="${track_names[key]}">${track_names[key]}</span>`
        items+=`<tr>
        <td class="NAE_track_del"><b>[x]</b></td>
        <td class="NAE_bid_single" data-bidkey=${key} data-start=${obj[key]["start"]} title="${(obj[key]["log"]).slice(-25).join("&#10;")}"><b>[${key}]</b></td>
        <td class="NAE_poster"><b>${poster}</b></td>
        <td class="NAE_lot_name">${nameEl}</td>
        <td class="NAE_lot_bid" data-current_bid=${Number(obj[key]["price"])}>${Number(obj[key]["price"])==0 ? obj[key]["start"]/1000+'k' : '<b>'+Number(obj[key]["price"])/1000+'k'+'</b>'}</td>
        <td>${post_link}</td>
        <td class="NAE_bid_time" id="NAE_bid_time_${key}" data-place="bid" data-end_time=${time}></td>
        </tr>
        `;
        add_timer(`NAE_bid_time_${key}`);
    }
    document.querySelector('#NAE_table_wrapper').insertAdjacentHTML("beforeend", `<table class="NAE_items"><tbody>${items}</tbody></table>`);

    document.querySelectorAll('.NAE_bid_single').forEach((btn) => {
        btn.addEventListener("click", function (e) { bid_single(this, false ) })
        btn.addEventListener("contextmenu", (e) => { e.preventDefault(); bid_single(btn, true) } );;
    })

    document.querySelectorAll('.NAE_track_del').forEach((btn) => {
        btn.addEventListener("click", function (){del_track(this)});
    })

    if(document.querySelector('.NAE_poster_notme')){
        document.querySelector('#NAE_bid_alert').classList.add("NAE_run_alert");
    }
    else document.querySelector('#NAE_bid_alert').classList.remove("NAE_run_alert");

    refresh_timers();

    // Trigger auto proxy bid evaluation here as soon as elements are rendered
    handleAutoProxyBid();
}

function calculate_inc_bid(e){
    let price = Number(e.parentNode.querySelector(".NAE_lot_bid").dataset.current_bid)/1000
    if(price==0){
        price = Number(e.dataset.start)/1000;
    } else{
        if(price<=300) price=Math.ceil((price*1.05)/20)*20;
        else if(price<=920) price=Math.ceil((price*1.05)/50)*50;
        else price=Math.ceil((price*1.05)/100)*100;
    }

    if(price>=1000 && price%100==0) return `${e.innerText} ${price/1000}m`;
    else return `${e.innerText} ${price}k`
}

function del_track(lot){
    lot.parentNode.style.display = "none";
    let lot_id = lot.parentNode.children[1].innerText;
    let clear_id = "lot_"+lot_id.substring(1, lot_id.length-1).replace("#","\\#");
    clear_id = clear_id.replace(/\./,"\\.")
    if(document.querySelector(`#${clear_id}`)){
        document.querySelector(`#${clear_id}`).click();
    }
    else{
        let temp = document.createElement('div');
        temp.setAttribute("id", clear_id);
        track_lot(temp);
    }
}

function checkTimeZone(){
    let forum_hours = parseInt(document.querySelectorAll('#gfooter td')[2].innerText.split(' - ')[1].split(':')[0]);
    let current_hours = new Date().getHours();
    if(forum_hours!=current_hours) return false;
    else return true;
}

async function setUsername() {
    try {
        const mynickEl = document.querySelector('#NAE_mynick');

        const url = document.querySelector('.home > b:nth-child(1) > a:nth-child(1)')?.href;
        if (!url) return;

        const res = await fetch(url, {
            credentials: 'include'
        });

        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const mynick = doc.querySelector('#profilename')?.innerText.trim() || '';

        if (mynick !== '') {
            GM_setValue('mynick', mynick);

            // Menu UI
            if (mynickEl) {
                if ('value' in mynickEl) {
                    mynickEl.value = mynick;
                } else {
                    mynickEl.textContent = mynick;
                }
            }
        }
        return;
    } catch (err) {
        console.error(err);
        alert('Failed to retrieve your nickname.');
        return;
    }
}

GM.addStyle(`
span.NAE_lot {
    background-color: #9595957d;
    padding: 0px 10px;
    margin-right: 5px;
    border-radius: 3px;
    cursor: pointer;
}
.NAE_lot.yestrack {
    background-color: #ff00002b;
    background-image: url('https://i.imgur.com/9HP4cyX.png');
    background-size: 70% auto;
    background-repeat: no-repeat;
    background-position: center;
}
div#NAE_menu {
    min-width: 700px;
	max-width: 1000px;
	width: auto;
    min-height: 336px;
    position: fixed;
    top: 13%;
	right: 0;
    transform: translateX(calc(100% - 25px));
    border-radius: 10px 0px 0px 10px;
    overflow: hidden;
    border: solid 1px;
    padding: 20px 0px;
    transition: transform 0.2s;
}
div#NAE_menu.open_menu {
    transform: translateX(0);
}
div#NAE_menu_opener {
    width: 1200px;
    rotate: 270deg;
    position: absolute;
    display: flex;
    border-radius: 10px;
    cursor: pointer;
    left: -595px;
    background-repeat: repeat-x;
    background-position: top;
    border: solid;
    border-width: 0px 0px 1px 0px;
}
table.NAE_items {
    width: auto;
    margin-left: 31px;
}
span.NAE_name {
    display: inline-block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
div#NAE_table_wrapper {
    max-height: 426px;
    overflow: auto;
    margin-top: 7px;
}
div#NAE_menu.open_menu div#NAE_table_wrapper {
    max-height: 700px;
}
.NAE_items td {
    text-align: left;
}
.NAE_items td {
    padding: 2px 4px;
}
.maintitle span {
    position: relative;
    right: -350px;
    top: 2px;
    user-select: none;
}
td.NAE_bid_single {
    cursor: pointer;
}
td.NAE_bid_single:hover {
    color: #f00;
}
td.NAE_bid_single:active {
    color: #ff7800;
}

td.NAE_track_del {
    color: #a00;
    cursor: pointer;
}
td.NAE_track_del:hover {
    color: #f00;
}
td.NAE_poster {
    max-width: 110px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
span.NAE_poster_me {
    color: #00bf00;
}
span.NAE_poster_notme {
    color: #f00;
}
input#NAE_mynick {
    vertical-align: baseline;
    padding: 3px;
    text-align: center;
    cursor: pointer;
    opacity: 0.6;
    border-radius: 3px;
    width: 100px;
}
input#NAE_mynick:focus {
    opacity: 1.0;
}
div#NAE_bid_alert {
    display: none;
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    color: #fff;
    text-align: center;
    vertical-align: middle;
    line-height: 18px;
    font-weight: bold;
    left: 4px;
    top: 5px;
    user-select: none;
    cursor: pointer;
    /*animation: alert 2s steps(1) infinite;*/
	background: #f00;
}
@keyframes alert {
  50% {
    background: #f006;
  }
}
div.NAE_run_alert {
    display: block !important;
}
.NAE_bid_time {
    min-width: 50px;
}
span.NAE_timer_end {
    opacity: 0.5;
    user-select: none;
}
.NAE_bid_limit {
    color: #f00;
}
div#NAE_menu_header {
    display: flex;
    width: 608px;
    margin-left: 37px;
    justify-content: space-between;
    height: 39px;
    margin-top: -10px;
}
div#NAE_menu_section3 {
    align-self: center;
    font-size: 20px;
    min-width: 130px;
}
div#NAE_menu_section2 {
    align-self: center;
}
div#NAE_menu_section1 {
    align-self: center;
}
button#NAE_refresh_button {
    width: 168px;
}
#NAE_notyfication {
    vertical-align: baseline;
    position: relative;
    top: 2px;
    margin-left: 8px;
}
#NAE_menu_section1 span {
    vertical-align: initial;
}
div#NAE_timezone_alert {
    background: #f00;
    color: #fff;
    font-size: 16px;
    padding: 8px 0px;
    margin-bottom: 10px;
    margin-top: -9px;
    cursor: pointer;
    text-decoration: none;
}
div#NAE_timezone_alert:hover {
    background: #ff6c00;
}
a.NAE_timezone_link {
    text-decoration: none;
}
.NAE_button {
    border-radius: 3px;
    padding: 3px;
    margin-top: -3px;
    cursor: pointer;
}
#helper_version {
    position: absolute;
    bottom: 3px;
    right: 5px;
    opacity: 0.3;
}
`);

// =========================================================================
// === [New Feature] Proxy Bid Module ===
// =========================================================================

let hasAutoBidRun = false;

// Initialize styles: Add hover and underline effects for NAE_bid_single elements
const proxyStyle = document.createElement('style');
proxyStyle.innerHTML = `
    .NAE_bid_single {
        cursor: pointer !important;
        text-decoration: underline !important;
    }
    .NAE_bid_single:hover {
        color: #ff3333 !important;
    }
`;
document.head.appendChild(proxyStyle);

/**
 * Standardize any user input into "k" units (e.g., "2200k", "2200", and "2200000" all normalize to 2200)
 * @param {string} input - User raw input
 * @returns {number} Standardized value in k units
 */
function parseProxyBidValueToK(input) {
    let val = input.trim().toLowerCase();
    let num = parseFloat(val);
    if (isNaN(num)) return NaN;

    if (val.endsWith('k')) {
        return num; // "2200k" -> 2200
    }
    if (num >= 100000) {
        return num / 1000; // "2200000" (raw Credits) -> 2200
    }
    return num; // "2200" -> 2200 (representing 2200k)
}

/**
 * Open the proxy bid configuration window
 * @param {string} itemId - The item key (e.g., "drr02")
 */
function openProxyBidWindow(itemId) {
    const storageKey = SHOWTOPIC+'_proxy_bid_' + itemId;
    const currentLimitK = GM_getValue(storageKey);
    const displayLimit = currentLimitK ? currentLimitK + ' k' : 'Not Set';

    const input = prompt(
        `Proxy Bid Settings\n\n` +
        `Item Key: ${itemId}\n` +
        `Current Max Limit: ${displayLimit}\n\n` +
        `Enter your maximum bid amount in k (2200 for 2200k):\n` +
        `(Leave blank and press OK to clear this proxy bid)`,
        currentLimitK || ''
    );

    if (input === null) return; // User cancelled

    const val = input.trim();
    if (val === '') {
        GM_deleteValue(storageKey);
        alert(`Proxy bid cleared for Item ${itemId}.`);
    } else {
        const parsedLimitK = parseProxyBidValueToK(val);
        if (isNaN(parsedLimitK) || parsedLimitK <= 0) {
            alert('Please enter a valid numeric value!');
            return;
        }
        GM_setValue(storageKey, parsedLimitK);
        alert(`Max limit for Item ${itemId} set to ${parsedLimitK}k. Please reload the page after setting all proxy bid limits.`);
    }
}

/**
 * Initialize click event listeners for tracked item IDs (Always active on load)
 */
function initProxyBidListener() {
    // Register the click listener unconditionally so it is always active
    document.addEventListener('click', function(e) {
        const target = e.target;

        // Find closest NAE_bid_single element to handle clicks on nested elements like <b>
        const cell = target.closest('.NAE_bid_single');
        if (cell) {
            e.preventDefault();

            // Check if #NAE_mynick is configured dynamically upon click
            const mynickEl = document.querySelector('#NAE_mynick');
            const mynick = mynickEl ? (mynickEl.value || mynickEl.textContent || '').trim() : '';

            if (!nickIsSet(mynick)) {
                alert('Please configure your nickname (#NAE_mynick) before setting proxy bids.');
                return;
            }

            // Extract string item key (e.g., "drr02")
            const itemId = cell.dataset.bidkey;
            if (!itemId) {
                return;
            }

            openProxyBidWindow(itemId);
        }
    });
}

/**
 * Check if nickname is validly set
 */
function nickIsSet(nick) {
    return nick && nick !== '';
}

/**
 * Trigger auto-bid evaluation after page reload (Executes only for items where you are outbid)
 */
function handleAutoProxyBid() {
    // Safety flag check: Prevent multiple triggers per page load session
    if (hasAutoBidRun) {
        console.log('[ProxyBid] Auto-bid already completed for this load. Skipping.');
        return;
    }

    // 1. Load all configured proxy bids from GM storage (stored strictly in k units)
    const activeBids = [];
    let keys = [];
    try {
        keys = GM_listValues();
    } catch (e) {
        console.error('[ProxyBid] Failed to list GM values:', e);
        return;
    }

    for (const key of keys) {
        if (key.startsWith(SHOWTOPIC+'_proxy_bid_')) {
            const itemId = key.replace(SHOWTOPIC+'_proxy_bid_', '');
            const maxLimitK = parseFloat(GM_getValue(key));
            if (!isNaN(maxLimitK)) {
                activeBids.push({ itemId, maxLimitK });
            }
        }
    }

    if (activeBids.length === 0) return;

    let bidsToSubmit = [];

    // 2. Evaluate bid limits for each configured item dynamically based on the page DOM row
    for (const item of activeBids) {
        const itemId = item.itemId;
        const maxLimitK = item.maxLimitK;

        // Find the cell representing the specific item key, safely escaped
        const cell = document.querySelector(`.NAE_bid_single[data-bidkey="${CSS.escape(itemId)}"]`);
        if (!cell) {
            console.log(`[ProxyBid] Item ${itemId} is ended or removed.`);
            GM_deleteValue(SHOWTOPIC+'_proxy_bid_'+itemId);
            continue;
        }

        // Trace up to the table row (<tr>) containing this item's data
        const row = cell.closest('tr');

        // Determine if NAE_poster_notme is active on this row (indicating you have been outbid on this item)
        const isPosterNotMe = row && row.querySelector('.NAE_poster_notme') !== null;

        if (!isPosterNotMe) {
            console.log(`[ProxyBid] You are currently the highest bidder for Item ${itemId}. Skipping.`);
            continue;
        }

        // 3. Mathematical Next Bid Calculation based on the 5% increment rule
        const startPrice = parseFloat(cell.dataset.start) || 50000; // Default to 50k if missing

        // Find current price dynamically from dataset on .NAE_lot_bid
        const bidCell = row.querySelector('.NAE_lot_bid');
        const currentPrice = bidCell ? parseFloat(bidCell.dataset.current_bid) : 0;

        let nextBidCredits = 0;
        if (currentPrice === 0) {
            // No current bids exist: Next bid is the starting price
            nextBidCredits = startPrice;
        } else {
            // Apply the 5% increment rule: Math.ceil(price * 1.05)
            nextBidCredits = Math.ceil(currentPrice * 1.05);
        }

        // Convert calculated next bid to standardized "k" units (round up to ensure validity)
        const nextBidNumK = Math.ceil(nextBidCredits / 1000);

        // Compare next minimum bid in k with the user's max limit in k
        if (nextBidNumK <= maxLimitK) {
            bidsToSubmit.push({ itemId, amountK: nextBidNumK });
        } else {
            console.log(`[ProxyBid] Item ${itemId} next minimum bid (${nextBidNumK}k) exceeds your limit (${maxLimitK}k).`);
            GM_deleteValue(SHOWTOPIC+'_proxy_bid_'+itemId);
        }
    }

    // Return if auction haven't started
    if (!AuctionStarted) {
        console.log('[ProxyBid] Auction not started yet. Skipping.');
        return;
    }

    // 4. Autofill and auto-submit
    if (bidsToSubmit.length > 0) {
        const postTextarea = document.querySelector('textarea[name="Post"]') || document.querySelector('#fast-reply-textarea');
        if (postTextarea) {
            // Set flag to true to prevent loops
            hasAutoBidRun = true;

            // Format bids into a newline-separated string like "drr02 150k"
            const textToFill = bidsToSubmit.map(b => `[${b.itemId}] ${b.amountK}k`).join('\n');

            postTextarea.value = textToFill;
            postTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            postTextarea.dispatchEvent(new Event('change', { bubbles: true }));

            console.log(`[ProxyBid] Filled proxy bids successfully:\n${textToFill}`);

            // Delay submission slightly to allow the UI state to update
            setTimeout(() => {
                const submitBtn = document.querySelector('input.button:nth-child(10)');
                if (submitBtn) {
                    console.log('[ProxyBid] Clicking submit button (input.button:nth-child(10))...');
                    submitBtn.click();
                } else {
                    console.warn('[ProxyBid] Submit button (input.button:nth-child(10)) not found. Please submit manually.');
                }
            }, 800);
        } else {
            console.error('[ProxyBid] Reply textarea not found. Auto-bid aborted.');
        }
    }
}

// =========================================================================
// === [New Feature] Proxy Bid Module End ===
// =========================================================================
