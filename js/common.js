// ==================== 全局状态管理 ====================
const AppState = {
    isLoggedIn: false,
    user: null,
    loginType: 'individual',
    currentPage: 'home',
    // 实名认证状态: 'unverified' | 'verified' | 'enterprise_verified'
    realNameStatus: 'unverified',
    // 钱包余额
    balance: 0,
    // 待执行动作（用于登录后/认证后/充值后恢复）
    pendingAction: null
};

// 模拟用户数据
const mockUser = {
    id: 1,
    username: 'zhangsan',
    name: '张三',
    phone: '138****8888',
    email: 'zhangsan@example.com',
    avatar: null,
    createdAt: '2026-01-15',
    apiKey: 'sk-opc-7a8b9c0d1e2f3g4h5i6j7k8l9m0n1o2p'
};

// ==================== 状态持久化 ====================
function saveAppState() {
    const state = {
        realNameStatus: AppState.realNameStatus,
        balance: AppState.balance,
        pendingAction: AppState.pendingAction
    };
    localStorage.setItem('opc_app_state', JSON.stringify(state));
}

function loadAppState() {
    try {
        const raw = localStorage.getItem('opc_app_state');
        if (raw) {
            const state = JSON.parse(raw);
            AppState.realNameStatus = state.realNameStatus || 'unverified';
            AppState.balance = typeof state.balance === 'number' ? state.balance : 0;
            AppState.pendingAction = state.pendingAction || null;
        }
    } catch (e) {
        console.warn('加载AppState失败', e);
    }
}

// ==================== 登录状态检查 ====================
function checkLoginStatus() {
    loadAppState();
    const token = localStorage.getItem('opc_token');
    if (token) {
        AppState.isLoggedIn = true;
        AppState.user = mockUser;
        initSampleConsumption();
    }
    updateNavigation();
}

// ==================== 导航栏更新 ====================
function updateNavigation() {
    const userSection = document.getElementById('user-section');
    if (!userSection) return;

    if (AppState.isLoggedIn && AppState.user) {
        const initial = AppState.user.name.charAt(0).toUpperCase();
        userSection.innerHTML = `
            <div class="relative group/usermenu">
                <a href="profile.html" class="flex items-center space-x-2 text-gray-600 hover:text-primary transition">
                    <div class="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-semibold">
                        ${initial}
                    </div>
                    <span>${AppState.user.name}</span>
                    <svg class="w-4 h-4 text-gray-500 transition-transform group-hover/usermenu:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                </a>
                <div class="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 opacity-0 invisible group-hover/usermenu:opacity-100 group-hover/usermenu:visible transition-all duration-200 z-50">
                    <a href="profile.html" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition">个人中心</a>
                    <button onclick="logout()" class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition">退出登录</button>
                </div>
            </div>
        `;
    } else {
        userSection.innerHTML = `
            <a href="login.html" class="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition">登录/注册</a>
        `;
    }
}

// ==================== 退出登录 ====================
function logout() {
    localStorage.removeItem('opc_token');
    localStorage.removeItem('opc_app_state');
    AppState.isLoggedIn = false;
    AppState.user = null;
    AppState.realNameStatus = 'unverified';
    AppState.balance = 0;
    AppState.pendingAction = null;
    window.location.href = 'index.html';
}

// ==================== 待办动作管理 ====================
function storePendingAction(action) {
    const actionData = {
        action: action.action || 'default',
        callback: action.callback || null,
        callbackName: action.callbackName || null,
        args: action.args || [],
        sourcePage: window.location.pathname,
        timestamp: Date.now()
    };
    // callback 函数无法序列化，所以如果有回调，存储回调名称
    AppState.pendingAction = actionData;
    saveAppState();
}

function clearPendingAction() {
    AppState.pendingAction = null;
    saveAppState();
}

function executePendingAction(skipCallback = false) {
    if (!AppState.pendingAction) return false;
    const action = AppState.pendingAction;
    const now = Date.now();
    // 超过30分钟的待办动作自动清除
    if (now - action.timestamp > 30 * 60 * 1000) {
        clearPendingAction();
        return false;
    }
    
    // skipCallback 为 true 时，仅清除待办动作，不执行回调
    // 用于页面加载时避免自动触发跨页面的回调函数
    if (skipCallback) {
        // 如果有 targetUrl 则跳转
        if (action.targetUrl) {
            window.location.href = action.targetUrl;
            return true;
        }
        // 否则仅清除，等待用户后续操作
        clearPendingAction();
        return false;
    }
    
    clearPendingAction();
    
    // 如果有回调名称，尝试查找对应函数执行
    if (action.callbackName && typeof window[action.callbackName] === 'function') {
        window[action.callbackName](...action.args);
        return true;
    }
    
    // 如果有 targetUrl，则跳转
    if (action.targetUrl) {
        showToast(`正在进入${action.action || '服务'}`);
        setTimeout(() => {
            window.location.href = action.targetUrl;
        }, 1000);
        return true;
    }
    
    // 回调不存在且无 targetUrl：不跳转，仅提示用户可继续操作
    // 避免从 services.html 跳转到 profile.html 认证后，又自动跳回 services.html
    if (action.action) {
        showToast(`${action.action}已通过认证，可继续操作`);
    }
    return false;
}

// ==================== 统一拦截器链 ====================
// withAuthChain(options)
// options: { action: 'AI模型服务', callback: fn, callbackName: 'xxx', minBalance: 0 }
function withAuthChain(options = {}) {
    // 第一级：未登录拦截
    if (!AppState.isLoggedIn) {
        showAuthModal({
            title: '需要登录',
            message: '请先登录或注册账号后再进行操作。',
            icon: 'fa-lock',
            btnText: '去登录',
            next: 'login'
        });
        return false;
    }
    
    // 第二级：实名认证拦截
    if (AppState.realNameStatus === 'unverified') {
        showAuthModal({
            title: '需要实名认证',
            message: '请先完成身份认证，即可使用该服务。',
            icon: 'fa-id-card',
            btnText: '去认证',
            next: 'verify'
        });
        return false;
    }
    
    // 第二级：余额不足拦截
    const minBalance = options.minBalance || 0;
    if (AppState.balance < minBalance) {
        showAuthModal({
            title: '余额不足',
            message: `当前余额 ¥${AppState.balance.toFixed(2)} 不足，请先充值。`,
            icon: 'fa-wallet',
            btnText: '去充值',
            next: 'recharge'
        });
        return false;
    }
    
    // 第四级：所有条件满足，执行回调
    if (options.callback && typeof options.callback === 'function') {
        options.callback();
        return true;
    }
    
    // 如果有回调名称，查找对应的全局函数并执行
    if (options.callbackName && typeof window[options.callbackName] === 'function') {
        window[options.callbackName](...options.args);
        return true;
    }
    
    // 默认：记录待办动作并跳转
    storePendingAction({
        action: options.action || '服务',
        callbackName: options.callbackName || null,
        args: options.args || []
    });
    
    if (options.targetUrl) {
        window.location.href = options.targetUrl;
    } else {
        showToast(`正在进入${options.action || '服务'}`);
        setTimeout(() => {
            window.location.href = 'services.html';
        }, 1000);
    }
    
    return true;
}

// 统一认证弹窗
function showAuthModal(options = {}) {
    const existingModal = document.getElementById('authRequiredModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'authRequiredModal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-md w-full mx-4 p-8 shadow-2xl">
            <div class="text-center mb-6">
                <div class="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas ${options.icon || 'fa-lock'} text-2xl text-primary"></i>
                </div>
                <h3 class="text-xl font-bold text-secondary mb-2">${options.title || '提示'}</h3>
                <p class="text-gray-600">${options.message || ''}</p>
            </div>
            <div class="flex space-x-4">
                <button onclick="closeAuthModal()" class="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-50 transition">取消</button>
                <button onclick="handleAuthNext('${options.next}')" class="flex-1 bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-dark transition">${options.btnText || '确定'}</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeAuthModal() {
    const modal = document.getElementById('authRequiredModal');
    if (modal) modal.remove();
}

function handleAuthNext(next) {
    closeAuthModal();
    switch (next) {
        case 'login':
            // 存储待办动作，登录页会读取并恢复
            if (AppState.pendingAction) {
                saveAppState();
            }
            window.location.href = 'login.html';
            break;
        case 'verify':
            // 存储待办动作，认证通过后自动执行
            if (!AppState.pendingAction) {
                storePendingAction({ action: '服务' });
            }
            // 如果当前已在 profile.html，切换 section 即可
            if (window.location.pathname.endsWith('profile.html') && typeof switchSection === 'function') {
                switchSection('account');
            } else {
                window.location.href = 'profile.html#account';
            }
            break;
        case 'profile':
            // 如果当前已在 profile.html，切换 section 即可
            if (window.location.pathname.endsWith('profile.html') && typeof switchSection === 'function') {
                switchSection('account');
            } else {
                window.location.href = 'profile.html#account';
            }
            break;
        case 'recharge':
            // 如果当前已在 profile.html，切换 section 即可
            if (window.location.pathname.endsWith('profile.html') && typeof switchSection === 'function') {
                switchSection('wallet');
            } else {
                window.location.href = 'profile.html#wallet';
            }
            break;
        default:
            window.location.href = 'index.html';
    }
}

// ==================== 便捷拦截函数（兼容旧API） ====================
// 支持两种调用方式：
// 1. requireLogin() → 使用默认行为
// 2. requireLogin({ action: 'xxx', targetUrl: 'xxx' }) → 使用自定义配置
function requireLogin(options = {}) {
    // 兼容旧的 onclick="return requireLogin(event)" 调用
    if (options && typeof options.preventDefault === 'function') {
        options.preventDefault();
        options = {};
    }
    return withAuthChain({
        action: options.action || '服务',
        callback: options.callback || null,
        callbackName: options.callbackName || null,
        targetUrl: options.targetUrl || null,
        minBalance: options.minBalance || 0
    });
}

// ==================== 实名认证模块 ====================
function submitRealName(formData) {
    AppState.realNameStatus = 'verified';
    saveAppState();
    showToast('实名认证已通过！');
    executePendingAction();
    if (typeof updateProfileUI === 'function') {
        updateProfileUI();
    }
}

function submitEnterpriseRealName(formData) {
    AppState.realNameStatus = 'enterprise_verified';
    saveAppState();
    showToast('企业认证已通过！');
    executePendingAction();
    if (typeof updateProfileUI === 'function') {
        updateProfileUI();
    }
}

// ==================== 钱包模块 ====================
function addBalance(amount, paymentMethod) {
    AppState.balance += amount;
    saveAppState();
    // 生成充值订单
    var order = {
        id: 'ORD' + new Date().toISOString().slice(0,10).replace(/-/g,'') + String(Math.floor(Math.random()*900+100)),
        userId: AppState.user ? AppState.user.id : 0,
        userName: AppState.user ? AppState.user.name : '未知用户',
        type: 'recharge',
        amount: amount,
        paymentMethod: paymentMethod || '在线支付',
        status: '已完成',
        time: new Date().toLocaleString('zh-CN',{hour12:false}),
        invoiceAvailable: false
    };
    var orders = getOrders();
    orders.push(order);
    saveOrders(orders);
    showToast(`充值成功，当前余额 ¥${AppState.balance.toFixed(2)}`);
    if (typeof updateProfileUI === 'function') {
        updateProfileUI();
    }
    executePendingAction();
}

// ==================== 订单管理 ====================
function getOrders(){
    try{
        var raw = localStorage.getItem('opc_orders');
        return raw ? JSON.parse(raw) : [];
    }catch(e){return[]}
}
function saveOrders(orders){
    localStorage.setItem('opc_orders', JSON.stringify(orders));
}
function getUserOrders(userId){
    var all = getOrders();
    if(userId) return all.filter(function(o){return o.userId===userId});
    return all;
}

// ==================== 消费记录管理 ====================
function getConsumption(){
    try{
        var raw = localStorage.getItem('opc_consumption');
        return raw ? JSON.parse(raw) : [];
    }catch(e){return[]}
}
function saveConsumption(list){
    localStorage.setItem('opc_consumption', JSON.stringify(list));
}
function getUserConsumption(userId){
    var all = getConsumption();
    if(userId) return all.filter(function(c){return c.userId===userId});
    return all;
}
function recordConsumption(amount, tokens, service, model, type){
    var record = {
        id: 'C' + Date.now(),
        userId: AppState.user ? AppState.user.id : 0,
        userName: AppState.user ? AppState.user.name : '未知',
        date: new Date().toISOString().slice(0,10),
        time: new Date().toLocaleString('zh-CN',{hour12:false}),
        service: service || '未知服务',
        model: model || '--',
        amount: amount || 0,
        tokens: tokens || 0,
        type: type || '消费'
    };
    var list = getConsumption();
    list.push(record);
    saveConsumption(list);
    AppState.consumptionCount = (AppState.consumptionCount || 0) + 1;
    saveAppState();
}

function initSampleConsumption(){
    var existing = getConsumption();
    if (existing.length > 0) return;
    var uid = AppState.user ? AppState.user.id : 1;
    var samples = [
        {userId:uid,date:'2026-05-20',service:'Qwen-Max',model:'通义千问',amount:45,tokens:210000,type:'模型调用'},
        {userId:uid,date:'2026-05-18',service:'DeepSeek-V3',model:'DeepSeek',amount:35,tokens:180000,type:'模型调用'},
        {userId:uid,date:'2026-05-15',service:'企业工商信息查询',model:'数据API',amount:25,tokens:0,type:'数据API'},
        {userId:uid,date:'2026-05-12',service:'GPT-4o',model:'OpenAI',amount:15,tokens:170000,type:'模型调用'},
        {userId:uid,date:'2026-05-08',service:'弹性云服务器 ECS',model:'云资源',amount:120,tokens:0,type:'云资源'}
    ];
    samples.forEach(function(s){
        s.id = 'C' + Date.now() + Math.random().toString(36).slice(2,6);
        s.time = s.date + ' 10:30:00';
        s.userName = AppState.user ? AppState.user.name : '测试用户';
    });
    saveConsumption(samples);
}

// ==================== 工具函数 ====================
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('复制成功');
    }).catch(() => {
        showToast('复制失败，请手动复制');
    });
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `fixed top-20 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-all duration-300 transform translate-x-full ${
        type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
    }, 100);

    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function formatMoney(amount) {
    return '¥' + amount.toFixed(2);
}

function maskString(str, start = 3, end = 4) {
    if (!str || str.length <= start + end) return str;
    return str.substring(0, start) + '****' + str.substring(str.length - end);
}

// 模拟API调用
function mockApiCall(data, delay = 500) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({ success: true, data });
        }, delay);
    });
}

// ==================== 活动报名存储 ====================
function getEventRegistrations() {
    try {
        const raw = localStorage.getItem('opc_event_registrations');
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveEventRegistration(eventData) {
    const registrations = getEventRegistrations();
    registrations.push({
        id: 'evt-' + Date.now(),
        eventName: eventData.eventName || '',
        eventDate: eventData.eventDate || '',
        eventLocation: eventData.eventLocation || '',
        registeredAt: new Date().toISOString(),
        status: '已报名'
    });
    localStorage.setItem('opc_event_registrations', JSON.stringify(registrations));
}

function cancelEventRegistration(eventId) {
    let registrations = getEventRegistrations();
    registrations = registrations.map(function(r) {
        if (r.id === eventId) {
            r.status = '已取消';
        }
        return r;
    });
    localStorage.setItem('opc_event_registrations', JSON.stringify(registrations));
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
    checkLoginStatus();
    // 页面加载时不清除待办动作，仅在认证/充值/登录成功后执行
    // 避免 profile.html 加载时自动触发 services.html 的回调函数
});
