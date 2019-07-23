/**
 * A Bridge Between H5 And Native.
 * By: sam zhang
 * Created: 2019-4-18
 */

/*
  Bridge是为H5和APP客户端交互通讯而产生的一个中间件，即一个JavaScript的SDK，负责
  处理H5和APP客户端的方法调用、通信及H5页面自身的降级处理（非内嵌在客户端的情况）

 *========================H5与Android&iOS接口交互方式==========================*

 【JS调用Native】
    Android：通过执行JS全局方法prompt来供Native捕获的方式调用，格式： prompt(JSON)
    IOS：通过自定义Scheme或添加URI Hash的方式（当前使用后者）调用，
    格式： FSL://JSON 或 https://xxx.5udaikuan.com/xxx/index.html#JSON
    传参： JSON格式
       示例：
       {"nativeMethodName":"FFT_IM_Connect_Service","functionName":
       "FFT_IM_Connect_Service_Callback",
       "data":{"token":"1818a3fb855b4bfcac3dd8ab975b5f8b","userId":"100089972"}}
       注意：上述字段除nativeMethodName（指定要调用的native接口/方法名）为必要字段外，其余字段根据
       实际接口需要传入
  【NATIVE回调JS】
      NATIVE回调的JS函数/方法需挂载在全局（window）。
      某些回调需使用特定名称的JS函数/方法，如：物理键按下动作回调的JS方法名为FFT_Back_Service_CallBack；
      普通回调的JS函数/方法名可通过传参指定（如上JS调用Native接口时指定，参数字段名为functionName），
      Bridge内部会管理这些传参指定的JS函数/方法，待Native执行回调后进行全局挂载移除。

  *==========================================================================*
 */


const Bridge = {
  version: '0.0.1',
  // 初始化，初始化过程执行的动作有：主动探测UA，判断页面所属的生存环境，如果是在APP中，
  // 会探测获取客户端的平台类型和版本号，并主动探测网络类型

  install(Vue) {
    Vue.prototype.$bridge = this;
    Vue.bridge = this;
    window.$bridge = this;
  },

  init() {
    this.platform = 'h5'; // 如果探测到是处理app中，则此项值会被修改成'andriod'或'ios'
    this.inApp = false; // 为了简化环环境判断,增加此字段
    this.client = {
      deviceId: '', // 设备ID
      appVersion: '', // app 版本
      barHeight: 0, // bar的高度
      isInstallWX: undefined, // 是否安装了微信
      phoneModel: '', // 手机型号
      phoneType: '', // Android or Ios
      sdkVersion: '', // sdk版本
      sysVersion: '', // 系统版本
    };
    this.connection = { // 网络类型
    };

    this.clientProxy = null;
    this.clientProxyNamePrefix = 'FFT_WVJB_CLIENT_PROXY'; // clientProxy名称前缀

    this.detectUserAgent();
    this.detectDeviceInfo();
    this.detectConnectionInfo();

    // 安卓的物理返回按键回调
    window.FFT_Back_Service_CallBack = window.FFT_Back_Service_CallBack || (() => {
      history.back();
    });
  },

  // UA探测，如果在客户端内则继续获取客户端的平台类型及版本号备用于后续的操作。
  // IOS : Mozilla/5.0 (iPhone; CPU iPhone OS 12_1_4 like Mac OS X) AppleWebKit/
  // 605.1.15 (KHTML, like Gecko) Mobile/16D57; SDK 3.9.0;net wifi

  detectUserAgent() {
    const ua = navigator.userAgent;

    this.inApp = /FFT_SQ_APP\s*(?:;|$|SDK)/igm.test(ua);
    const sdkVerMatch = ua.match(/(SDK);?[\s\/]+([\d.]+)?/igm);

    if (this.inApp) {
      this.platform = ua.match(/(iPad|iPhone|iPod)/igm) ? 'ios' : 'android';
      this.client.sdkVersion = sdkVerMatch[0].match(/[\d\.]+/igm)[0];
    }
  },

  // 设备信息探测，用于检测当前页面的设备信息
  detectDeviceInfo() {
    if (this.platform === 'h5') {
      return;
    }
    this.clientCall('FFT_GetDeviceId_Service', (data) => {
      this.client.deviceId = data.data || '';
    });
    this.clientCall('FFT_NativeClientInfo', (data) => {
      this.client = Object.assign({}, this.client, data);
    });
  },

  // 探测网络类型
  detectConnectionInfo() {
    if (this.platform === 'h5') {
      const navConnection = navigator.connection || navigator.mozConnection ||
        navigator.webkitConnection || {};
      this.connection = {
        type: (navConnection.type ? String(navConnection.type).toLowerCase() : ''),
      };
      return;
    }

    this.clientCall('FFT_GetNetworkInfo_Service', (data) => {
      const cdata = Object.assign({ type: '' }, data);
      // native api 返回数据值大小写可能不是一致，统一转成小写
      cdata.type = cdata.type ? String(cdata.type).toLowerCase() : '';
      this.connection = cdata;
    });
  },

  sendURI(uri) {
    /*
    let proxy = this.clientProxy || (document.querySelector(`#${this.clientProxyNamePrefix}`));

    if (proxy) {
      proxy.src = uri;
    } else {
      proxy = this.createProxy(uri);
    }
    this.clientProxy = proxy;
    */
    this.createProxy(uri);
  },

  createRandom() {
    return `${new Date().getTime()}_${parseInt(Math.random() * 1000000, 10)}`;
  },

  createProxy(uri) {
    const guid = this.createRandom();
    const WVJBIframe = document.createElement('iframe');
    WVJBIframe.id = `${this.clientProxyNamePrefix}_${guid}`;
    WVJBIframe.style.display = 'none';
    WVJBIframe.style.width = '0';
    WVJBIframe.style.height = '0';
    WVJBIframe.src = uri;

    document.body.appendChild(WVJBIframe);
    setTimeout(() => { document.body.removeChild(WVJBIframe); }, 300);
    return WVJBIframe;
  },

  createCallback(fn) {
    const guid = this.createRandom();
    const callbackName = `Bridge_Callbacks_${guid}`;

    window[callbackName] = (function (cbFn, cbName) {
      return function (json) {
        let data = {};
        try {
          if (json) {
            data = JSON.parse(json);
          }
        } catch (e) {
          if (json) {
            data = { data: json };
          }
        }
        cbFn(data);
        delete window[cbName];
      };
    }(fn, callbackName));
    return callbackName;
  },


  /**
   * 主要方法，用来调用客户端接口
   * @param { string } method native接口名
   * @param  [args] 其它参数传值；function类型参数为回调，优先判断；object类型为额外参数聚合对象
   */
  clientCall(method, ...args) {
    if (this.platform === 'h5' || !method) {
      return;
    }
    const obj = {
      nativeMethodName: method,
    };

    let data = args[0];
    let callback = args[1];

    if (args[0] && (typeof (args[0]) === 'function')) { // 优先检查是否为function类型的参数
      callback = args[0];
      data = args[1];
    }

    if (data && (typeof (data) === 'object')) {
      for (const attr in data) {
        obj[attr] = data[attr];
      }
    }
    let callbackName = '';
    if (typeof (callback) === 'function') {
      callbackName = this.createCallback(callback);
      obj.functionName = callbackName;
    }

    const strJSON = JSON.stringify(obj);
    const urlWithoutHash = location.href.replace(/\#[\s\S]*/igm, '');
    if (this.platform === 'android') {
      // android 通过prompt来监听接口调用
      prompt(strJSON);
    } else {
      // ios 通过scheme调用
      this.sendURI(`${urlWithoutHash}#${strJSON}`);
    }
  },
  recordVideo(params) {
    const defParmas = { videoId: '' };
    let fragMode = false; // 是否为分段传输模式
    if (this.platform === 'android') { // android采用分段传输
      defParmas.len = 1024 * 1024;
      defParmas.fragNum = 0;
      fragMode = true;
    }
    const clientParams = Object.assign({}, defParmas, params);

    return new Promise((resolve, reject) => {
      this.clientCall('FFT_StartRecorder_Service', clientParams, (res) => {
        if (+res.result === 1) { // 成功
          // ios一次性返回所有数据，不做分段传输
          // 用totalFrag做判断是否一次性全部输入视频数据，同时向下兼容
          if (!fragMode || !res.totalFrag) {
            resolve(res);
          } else {
            const videoId = res.videoId || ''; // 视频ID标记
            const storeKey = `__store_recode_video_${videoId}`; // 暂存的视频录制数据KEY，挂载在全局window对象下

            // 如果无有效视频ID 或 fragNum不等于传参指的分段num, 则数据有误，强制失败
            if (!videoId || (+res.fragNum !== clientParams.fragNum)) {
              reject(res);
              delete window[storeKey];
            } else {
              const resetData = { result: 1, imageBase64: '', videoBase64: '' };
              const videoStore = (+res.fragNum === 0) ? resetData : (window[storeKey] || resetData);

              videoStore.result = 1;
              if (res.imageBase64) videoStore.imageBase64 = res.imageBase64;
              if (res.videoBase64) videoStore.videoBase64 += res.videoBase64; // 拼接分段数据

              if (+res.totalFrag === +res.fragNum) { // 如果到达最后分段则停完成动作，回调传出最终数据,
                resolve(videoStore);
                delete window[storeKey];
              } else {
                window[storeKey] = videoStore;
                clientParams.fragNum += 1;
                clientParams.videoId = videoId;
                resolve(this.recordVideo(clientParams));
              }
            }
          }
        } else { // 失败
          reject(res);
        }
      });
    });
  },
  // GPS定位，优先使用native 接口，不可用时降级使用h5
  geo(successFn, failFn, timeout) {
    let timeoutFlag = false; // 是否达到超时时间
    let callbackFlag = false; // 是否回调处理完毕（在超时时间内，已有成功或失败回调动作）

    const tt = timeout || 15000;
    let timer = window.setTimeout(() => {
      timeoutFlag = !callbackFlag;
      if (timeoutFlag) {
        clearTimeout(timer);
        timer = null;
        failFn({ result: '0', erroType: '04', errMsg: '定位超时' });
      }
    }, tt);

    if (this.platform === 'h5') {
      window.$bmap.use((BMap) => {
        const geolocation = new BMap.Geolocation();
        geolocation.getCurrentPosition((r) => {
          if (timeoutFlag) return;
          let data;
          const geoStatus = geolocation.getStatus();
          if (geoStatus === window.BMAP_STATUS_SUCCESS) {
            data = { result: '1', latitude: r.point.lat, longitude: r.point.lng };
            successFn(data);
          } else {
            data = { result: '0', erroType: geoStatus, errMsg: '定位失败' };
            failFn(data);
          }
          callbackFlag = true;
        });
      }, () => {
        if (timeoutFlag) return;
        const data = { result: '0', erroType: '-1', errMsg: 'SDK加载失败' };
        failFn(data);
        callbackFlag = true;
      });
    } else {
      this.clientCall('FFT_GPS_Service', (data) => {
        if (timeoutFlag) return;
        if (!data || (+data.result !== 1) || !data.latitude || !data.longitude) {
          failFn(data);
        } else {
          successFn(data);
        }
        callbackFlag = true;
      });
    }
  },

};

// 初始化
Bridge.init();

export default Bridge;
