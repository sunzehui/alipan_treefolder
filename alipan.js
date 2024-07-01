// ==UserScript==
// @name         阿里云盘树状目录
// @version      1.0
// @description  阿里云盘分享页显示树状列表，点击logo旁边笑脸即可
// @author       sunzehui
// @license      MIT
// @match        https://www.alipan.com/s/*
// @grant        GM_xmlhttpRequest
// @require       https://cdn.bootcdn.net/ajax/libs/jquery/3.6.0/jquery.js
// @require https://cdn.bootcdn.net/ajax/libs/jquery.fancytree/2.38.1/jquery.fancytree-all-deps.js
// @namespace https://greasyfork.org/users/454712
// ==/UserScript==
;(function() {
  var listeners = []
  var doc = window.document
  varMutationObserver = window.MutationObserver || window.WebKitMutationObserver
  var observer

  function domReady(selector, fn) {
    // 储存选择器和回调函数
    listeners.push({
      selector: selector,
      fn: fn,
    })
    if (!observer) {
      // 监听document变化
      observer = new MutationObserver(check)
      observer.observe(doc.documentElement, {
        childList: true,
        subtree: true,
      })
    }
    // 检查该节点是否已经在DOM中
    check()
  }

  function check() {
    // 检查是否匹配已储存的节点
    for (var i = 0; i < listeners.length; i++) {
      var listener = listeners[i]
      // 检查指定节点是否有匹配
      var elements = doc.querySelectorAll(listener.selector)
      for (var j = 0; j < elements.length; j++) {
        var element = elements[j]
        // 确保回调函数只会对该元素调用一次
        if (!element.ready) {
          element.ready = true
          // 对该节点调用回调函数
          listener.fn.call(element, element)
        }
      }
    }
  }

  // 对外暴露ready
  window.domReady = domReady
})()
class AliPanTree {
  constructor() {
    this.tokenStorage = JSON.parse(localStorage.getItem('shareToken'))
    this.token = this.tokenStorage.share_token ? this.tokenStorage.share_token : ''
    this.device_id = this.parseCookie(document.cookie)['cna']
    this.share_id = this.getShareId()
    this.headers = {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
      'content-type': 'application/json;charset=UTF-8',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'x-canary': 'client=web,app=adrive,version=v2.3.1',
      'x-device-id': this.device_id,
      'x-share-token': this.token,
    }
    this.config = {
      insertContainer: 'div.CommonHeader--container--LPZpeBK',
      tagClassname: 'script-tag',
      insertTreeViewContainer: '.DetailLayout--container--264z8Xd',
      lazyLoad: true,
      fancytreeCSS_CDN: 'https://cdnjs.cloudflare.com/ajax/libs/jquery.fancytree/2.27.0/skin-win8/ui.fancytree.css',
    }
    this.api = {
      fileList: 'https://api.aliyundrive.com/adrive/v3/file/list',
    }
    this.params = {}
    this.isLoading = false
    this.nowSelectNode = null
  }

  parseCookie(str) {
    return str.split(';').map(v => v.split('=')).reduce((acc, v) => {
      acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim())
      return acc
    }, {})
  }
  getShareId() {
    const url = location.pathname
    return url.match(/(?<=\/s\/)(\w+)(?=\/folder)?/g)[0]
  }
  loading(type = 'start') {
    const tag = $('.' + this.config.tagClassname)

    if (this.isLoading == false && type == 'start') {
      this.isLoading = true
      setTimeout(() => {
        if (!this.isLoading) return
        if (tag.html() == 'o') {
          tag.html('0')
        } else {
          tag.html('o')
        }
        this.loading('start')
      }, 500)
    }

    if (this.isLoading == true && type == 'stop') {
      this.isLoading = false
      tag.html('&#128515;')
    }
  }

  renderTag() {
    const tag = document.createElement('div')
    tag.classList.add(this.config.tagClassname)
    tag.innerHTML = '&#128515;'

    let that = this
    $(document).on('click', '.' + this.config.tagClassname, function() {
      that.handleTagClick()
    })

    domReady('div.banner--7Ux0y', function() {
      document.querySelector('#root > div > div.page--W3d1U > .banner--7Ux0y').appendChild(tag)
    })
  }

  listAdapter(list, isFirst = true) {
    return list.map(item => {
      const hasFolder = !!item.children
      const obj = {
        title: item.name,
        folder: hasFolder,
        expanded: isFirst,
      }
      if (hasFolder) {
        obj.children = this.listAdapter(item.children, false)
      }
      return obj
    })
  }
  async buildFancytreeCfg() {
    const that = this
    const cfg = {
      selectMode: 1,
      autoScroll: true,
      activate: function(event, data) {
        that.nowSelectNode = data.node
      },
    }

    const loadRootNode = async (event, data) => {
      const list = await that.getList({ parent_file_id: 'root' })
      const children = await Promise.all(
        list.items.map(async pItem => {
          const cList = await that.getList({ parent_file_id: pItem.file_id })
          return cList.items.map(cItem => {
            return {
              title: cItem.name,
              folder: cItem.type === 'folder',
              key: cItem.file_id,
              lazy: true,
            }
          })
        })
      )
      return list.items.map(item => ({
        title: item.name,
        folder: item.type === 'folder',
        key: item.file_id,
        expanded: true,
        lazy: true,
        children: children.flat(1),
      }))
    }

    const loadNode = function(event, data) {
      data.result = that.getList({ parent_file_id: data.node.key }).then(list => {
        return list.items.map(item => ({
          title: item.name,
          folder: item.type === 'folder',
          key: item.file_id,
          lazy: item.type === 'folder',
        }))
      })
    }
    if (this.config.lazyLoad) {
      cfg['source'] = loadRootNode()
      cfg['lazyLoad'] = loadNode
    } else {
      const tree = await this.buildTree()
      cfg['source'] = await this.listAdapter(tree.children)
    }
    return cfg
  }
  async handleTagClick() {
    console.log('clicked')
    const $existsView = $('.tree-container')
    if ($existsView.length > 0) {
      return $existsView.show()
    }
    this.loading()
    await this.renderView()
    this.loading('stop')
  }
  // 显示侧边栏
  async renderView() {
    const cfg = await this.buildFancytreeCfg()
    const $treeContainer = $(`
      <div class="tree-container">
        <div class="bar">
          <button class="btn sunzehuiBtn">进入选中文件夹</button>
          <button class="btn close-btn">X</button>
        </div>
        <div class="tree"></div>
      </div>
    `)
    $treeContainer.find('.tree').fancytree(cfg)

    const that = this
    $(document).on('click', '.tree-container .bar .sunzehuiBtn', function() {
      let link = null
      const nowSelectNode = that.nowSelectNode
      if (nowSelectNode && nowSelectNode.folder) {
        link = `/s/${that.getShareId()}/folder/${nowSelectNode.key}`
      }
      if (link == null) alert('请选择文件夹')
      window.open(link, '_blank')
    })

    $(document).on('click', '.tree-container .bar .close-btn', function() {
      $('.tree-container').hide()
    })

    domReady('div.content--t4XI8', function() {
      $('#root > div > div.page--W3d1U').append($treeContainer)
    })
  }

  // 获取文件列表
  async getList({ parent_file_id }) {
    const result = await fetch(this.api.fileList, {
      headers: this.headers,
      referrerPolicy: 'origin',
      body: JSON.stringify({
        share_id: this.share_id,
        parent_file_id: parent_file_id || 'root',
        limit: 100,
        image_thumbnail_process: 'image/resize,w_160/format,jpeg',
        image_url_process: 'image/resize,w_1920/format,jpeg',
        video_thumbnail_process: 'video/snapshot,t_1000,f_jpg,ar_auto,w_300',
        order_by: 'name',
        order_direction: 'DESC',
      }),
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
    })
    return await result.json()
  }

  async buildTree(parent_file_id) {
    const treeNode = {}
    const root = await this.getList({ parent_file_id })
    treeNode.children = []
    for (let i = 0; i < root.items.length; i++) {
      let node = void 0
      if (root.items[i].type === 'folder') {
        node = await this.buildTree(root.items[i].file_id)
        node.name = root.items[i].name
      } else {
        node = root.items[i]
      }
      treeNode.children.push(node)
    }
    return treeNode
  }

  insertCSS() {
    const cssElem = document.createElement('link')
    cssElem.setAttribute('rel', 'stylesheet')
    cssElem.setAttribute('href', this.config.fancytreeCSS_CDN)
    document.body.appendChild(cssElem)
    const cssElem2 = document.createElement('style')
    cssElem2.innerHTML = `
    .tree-container{
      height: 100%;
      background: #ecf0f1;
      position: fixed;
      top: 60px;
      z-index: 9999;
      left: 0;
      overflow-y:scroll
    }
    .tree-container .bar{
      background: #bdc3c7;
      padding: 0 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 40px;
    }
    .btn{
      padding: 0;
      height: 30px;
    }
    .close-btn{
      background: transparent;
      border: none;
    }
    .sunzehuiBtn{
      display: inline-block;
      font-weight: 400;
      text-align: center;
      vertical-align: middle;
      user-select: none;
      border: 1px solid transparent;
      transition: color .15s ease-in-out,background-color .15s ease-in-out,border-color .15s ease-in-out,box-shadow .15s ease-in-out;
      padding: 0 8px;
      font-size: 14px;
      border-radius: .2rem;
      color: #fff;
      background-color: #6c757d;
      border-color: #6c757d;
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
    .${this.config.tagClassname}{
      width: 20px;
      height: 20px;
      margin-right: auto;
      transform: translateY(-3px);
      margin-left: 20px;
      cursor: pointer;
    }
    `
    document.body.appendChild(cssElem2)
  }
  async init() {
    this.insertCSS()
    this.renderTag()
  }
}
$(async function() {
  const aliPanTree = new AliPanTree()
  await aliPanTree.init()
})
