// ==UserScript==
// @name         阿里云盘树状目录
// @version      0.2
// @description  阿里云盘分享页显示树状列表，点击logo旁边笑脸即可，加载略慢，耐心等待
// @author       sunzehui
// @license      MIT
// @match        https://www.aliyundrive.com/s/*
// @grant        GM_xmlhttpRequest
// @require       https://cdn.bootcdn.net/ajax/libs/jquery/3.6.0/jquery.js
// @require https://cdn.bootcdn.net/ajax/libs/jquery.fancytree/2.38.1/jquery.fancytree-all-deps.js
// ==/UserScript==
const lazyLoad = true;
// 全局token
const tokenStorage = JSON.parse(localStorage.getItem("shareToken"));
const token = tokenStorage.share_token ? tokenStorage.share_token : "";
const parseCookie = (str) =>
  str
    .split(";")
    .map((v) => v.split("="))
    .reduce((acc, v) => {
      acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
      return acc;
    }, {});

const device_id = parseCookie(document.cookie)["cna"];
const share_id = getShareId();

let headers = {
  accept: "application/json, text/plain, */*",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
  "content-type": "application/json;charset=UTF-8",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "x-canary": "client=web,app=adrive,version=v2.3.1",
  "x-device-id": device_id,
  "x-share-token": token,
};

(function () {
  var listeners = [];
  var doc = window.document;
  varMutationObserver =
    window.MutationObserver || window.WebKitMutationObserver;
  var observer;

  function domReady(selector, fn) {
    // 储存选择器和回调函数
    listeners.push({
      selector: selector,
      fn: fn,
    });
    if (!observer) {
      // 监听document变化
      observer = new MutationObserver(check);
      observer.observe(doc.documentElement, {
        childList: true,
        subtree: true,
      });
    }
    // 检查该节点是否已经在DOM中
    check();
  }

  function check() {
    // 检查是否匹配已储存的节点
    for (var i = 0; i < listeners.length; i++) {
      var listener = listeners[i];
      // 检查指定节点是否有匹配
      var elements = doc.querySelectorAll(listener.selector);
      for (var j = 0; j < elements.length; j++) {
        var element = elements[j];
        // 确保回调函数只会对该元素调用一次
        if (!element.ready) {
          element.ready = true;
          // 对该节点调用回调函数
          listener.fn.call(element, element);
        }
      }
    }
  }

  // 对外暴露ready
  window.domReady = domReady;
})();
function getShareId() {
  const url = location.pathname;
  return url.match(/(?<=\/s\/)(\w+)(?=\/folder)?/g)[0];
}
let isLoading = false;
let textLoadingIdx = 0;
function loading(tag) {
  if (isLoading) {
    setTimeout(() => {
      if (textLoadingIdx === 0) {
        tag.innerHTML = "0";
        textLoadingIdx = 1;
      } else {
        tag.innerHTML = "o";
        textLoadingIdx = 0;
      }
      loading(tag);
    }, 500);
  }
}
function renderTag() {
  const tag = document.createElement("div");
  tag.style = `
      width: 20px;
      height: 20px;
      margin-right: auto;
      transform: translateY(-3px);
      margin-left: 20px;
      cursor: pointer;`;
  tag.innerHTML = "&#128515;";
  tag.onclick = async function () {
    const tokenStorage = JSON.parse(localStorage.getItem("shareToken"));
    const token = tokenStorage.share_token ? tokenStorage.share_token : "";
    headers["x-share-token"] = token;
    isLoading = true;
    loading(this);
    await renderView();
    isLoading = false;
    loading(this);
    setTimeout(() => {
      tag.innerHTML = "&#128515;";
    }, 1000);
  };
  domReady("div.banner--3rtM_.banner--sfaVZ", function () {
    document
      .querySelector(
        "#root > div > div.page--3indT > div.banner--3rtM_.banner--sfaVZ"
      )
      .appendChild(tag);
  });
}

function listAdapter(list, isFirst = true) {
  return list.map((item) => {
    const hasFolder = !!item.children;
    const obj = {
      title: item.name,
      folder: hasFolder,
      expanded: isFirst,
    };
    if (hasFolder) {
      obj.children = listAdapter(item.children, false);
    }
    return obj;
  });
}
let nowSelectNode = null;
async function buildFancytreeCfg() {
  const cfg = {
    selectMode: 1,
    activate: function (event, data) {
      nowSelectNode = data.node;
    },
  };
  const loadRootNode = async (event, data) => {
    const list = await getList({ parent_file_id: "root" });
    const children = await Promise.all(
      list.items.map(async (pItem) => {
        const cList = await getList({ parent_file_id: pItem.file_id });
        return cList.items.map((cItem) => {
          return {
            title: cItem.name,
            folder: cItem.type === "folder",
            key: cItem.file_id,
            lazy: true,
          };
        });
      })
    );
    return list.items.map((item) => ({
      title: item.name,
      folder: item.type === "folder",
      key: item.file_id,
      expanded: true,
      lazy: true,
      children: children.flat(1),
    }));
  };

  const loadNode = function (event, data) {
    data.result = getList({ parent_file_id: data.node.key }).then((list) => {
      return list.items.map((item) => ({
        title: item.name,
        folder: item.type === "folder",
        key: item.file_id,
        lazy: item.type === "folder",
      }));
    });
  };
  if (lazyLoad) {
    cfg["source"] = loadRootNode();
    cfg["lazyLoad"] = loadNode;
  } else {
    const tree = await buildTree();
    cfg["source"] = await listAdapter(tree.children);
  }
  return cfg;
}

// 显示侧边栏
async function renderView() {
  const treeContainer = document.createElement("div");
  const tree = document.createElement("div");
  const cfg = await buildFancytreeCfg();
  $(tree).fancytree(cfg);
  treeContainer.style = `
  height: 100%;
  background: #ecf0f1;
      position: absolute;
      top: 0;`;
  const bar = document.createElement("div");
  bar.style = "background: #bdc3c7;";
  const button = document.createElement("button");
  button.innerText = "进入选中文件夹";
  button.className = "sunzehuiBtn";
  button.onclick = function () {
    if (nowSelectNode && nowSelectNode.folder) {
      location.href = `/s/${getShareId()}/folder/${nowSelectNode.key}`;
    }
  };
  bar.appendChild(button);
  treeContainer.appendChild(bar);
  treeContainer.appendChild(tree);

  domReady("div.content--cklK-", function () {
    document
      .querySelector("#root > div > div.page--3indT > div.content--cklK-")
      .appendChild(treeContainer);
    $(".content--cklK-").css("position", "relative");
  });
}
// 获取文件列表
async function getList({ parent_file_id }) {
  const result = await fetch(
    "https://api.aliyundrive.com/adrive/v3/file/list",
    {
      headers,
      referrer: "https://www.aliyundrive.com/",
      referrerPolicy: "origin",
      body: JSON.stringify({
        share_id,
        parent_file_id: parent_file_id || "root",
        limit: 100,
        image_thumbnail_process: "image/resize,w_160/format,jpeg",
        image_url_process: "image/resize,w_1920/format,jpeg",
        video_thumbnail_process: "video/snapshot,t_1000,f_jpg,ar_auto,w_300",
        order_by: "name",
        order_direction: "DESC",
      }),
      method: "POST",
      mode: "cors",
      credentials: "omit",
    }
  );
  return await result.json();
}

async function buildTree(parent_file_id) {
  const treeNode = {};
  const root = await getList({ parent_file_id });
  treeNode.children = [];
  for (let i = 0; i < root.items.length; i++) {
    let node = void 0;
    if (root.items[i].type === "folder") {
      node = await buildTree(root.items[i].file_id);
      node.name = root.items[i].name;
    } else {
      node = root.items[i];
    }
    treeNode.children.push(node);
  }
  return treeNode;
}
$(async function () {
  renderTag();
  const cssElem = document.createElement("link");
  cssElem.setAttribute("rel", "stylesheet");
  cssElem.setAttribute(
    "href",
    "https://cdnjs.cloudflare.com/ajax/libs/jquery.fancytree/2.27.0/skin-win8/ui.fancytree.css"
  );
  document.body.appendChild(cssElem);
  const cssElem2 = document.createElement("style");
  cssElem2.innerHTML = `
  .sunzehuiBtn{   
    display: inline-block;
    font-weight: 400;
    text-align: center;
    vertical-align: middle;
    user-select: none;
    border: 1px solid transparent;
    transition: color .15s ease-in-out,background-color .15s ease-in-out,border-color .15s ease-in-out,box-shadow .15s ease-in-out;
    padding: 0.45rem .3rem;
    font-size: .675rem;
    line-height: 1.2;
    border-radius: .2rem;
    color: #fff;
    background-color: #6c757d;
    border-color: #6c757d;
    margin: 8px auto;
    cursor: pointer;
  } 
  .sunzehuiBtn:hover{
     text-decoration: none;
     background-color: #5a6268;
     border-color: #545b62;
  }
  .sunzehuiBtn:focus {
    box-shadow: 0 0 0 0.2rem rgb(130 138 145 / 50%);
  }
  ul.fancytree-container{
    background-color:transparent !important;
    border:none !important;
  }
  `;
  document.body.appendChild(cssElem2);
});
