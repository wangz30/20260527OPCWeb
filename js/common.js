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
    
    // 第二级：可用额度不足拦截
    const minBalance = options.minBalance || 0;
    if (AppState.balance < minBalance) {
        showAuthModal({
            title: '可用额度不足',
            message: `当前可用额度 ${AppState.balance.toFixed(0)} 不足，请先申请服务支持。`,
            icon: 'fa-wallet',
            btnText: '前往申请',
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
// 状态机：
//   个人：unverified → verifying → verified | unverified(带原因)
//   企业：unverified → pending_audit → enterprise_verified | enterprise_rejected(带原因)
// 管理员干预：撤销 / 强制重做 / 人工通过 / 人工驳回

// 状态徽章配色（全局使用）
const REALNAME_STATUS_MAP = {
    unverified: '未认证',
    verifying: '核验中',
    verified: '已通过',
    pending_audit: '待审核',
    enterprise_verified: '已通过',
    enterprise_rejected: '已驳回'
};
const REALNAME_STATUS_BADGE = {
    unverified: 'bg-gray-100 text-gray-600',
    verifying: 'bg-amber-50 text-amber-700',
    verified: 'bg-green-50 text-green-700',
    pending_audit: 'bg-amber-50 text-amber-700',
    enterprise_verified: 'bg-green-50 text-green-700',
    enterprise_rejected: 'bg-red-50 text-red-700'
};

// ====== 模拟公安部"三要素"实名核验接口 ======
// 实际接入：调用公安部/三要素核验服务API（实名认证接口）
// 原型实现：根据身份证末位模拟通过/失败（1.5s 异步）
function mockRealNameVerify(name, idCard) {
    return new Promise(function(resolve) {
        setTimeout(function() {
            var lastChar = idCard.slice(-1).toUpperCase();
            // 模拟规则：身份证末位为 '0' 时失败
            var passed = lastChar !== '0';
            resolve({
                passed: passed,
                code: passed ? 0 : 1001,
                message: passed ? '核验通过' : '姓名与身份证号不匹配，请核对后重试',
                verifyTime: new Date().toLocaleString('zh-CN', { hour12: false })
            });
        }, 1500);
    });
}

// 个人重试次数管理（每日 3 次）
var REALNAME_RETRY_KEY = 'opc_realname_retry';
function getRetryCount() {
    try {
        var d = JSON.parse(localStorage.getItem(REALNAME_RETRY_KEY) || '{}');
        var today = new Date().toISOString().slice(0, 10);
        if (d.date !== today) return 0;
        return d.count || 0;
    } catch (e) { return 0; }
}
function setRetryCount(n) {
    var today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(REALNAME_RETRY_KEY, JSON.stringify({ date: today, count: n }));
}

// 写入个人实名核验日志（供管理后台查看）
var REALNAME_LOG_KEY = 'opc_realname_logs';
function appendRealNameLog(log) {
    var list = [];
    try { list = JSON.parse(localStorage.getItem(REALNAME_LOG_KEY) || '[]'); } catch (e) { list = []; }
    list.unshift(Object.assign({
        id: 'RV' + Date.now(),
        type: 'personal', // personal | enterprise
        user: (AppState.user && AppState.user.name) || '匿名',
        userPhone: (AppState.user && AppState.user.phone) || '--',
        name: '',
        idCardMasked: '',
        result: 'pending', // passed | failed | pending
        message: '',
        time: new Date().toLocaleString('zh-CN', { hour12: false }),
        auditBy: '',
        auditTime: '',
        auditMessage: '',
        auditAction: ''
    }, log));
    localStorage.setItem(REALNAME_LOG_KEY, JSON.stringify(list));
}
function getRealNameLogs(type) {
    var list = [];
    try { list = JSON.parse(localStorage.getItem(REALNAME_LOG_KEY) || '[]'); } catch (e) { list = []; }
    if (type) list = list.filter(function(x) { return x.type === type; });
    return list;
}
function maskIdCard(id) {
    if (!id || id.length < 8) return '--';
    return id.slice(0, 4) + '***********' + id.slice(-4);
}

// 个人实名提交（异步调用 mock 接口）
function submitRealName(formData) {
    if (getRetryCount() >= 3) {
        if (typeof showToast === 'function') showToast('今日核验次数已用完，请明日再试', 'error');
        if (typeof window.onRealNameVerifyResult === 'function') {
            window.onRealNameVerifyResult({ passed: false, code: 9001, message: '今日核验次数已用完，请明日再试（每日 3 次）' });
        }
        return;
    }
    AppState.realNameStatus = 'verifying';
    saveAppState();
    if (typeof updateProfileUI === 'function') updateProfileUI();

    // 先写入"核验中"日志
    appendRealNameLog({
        name: formData.name || '',
        idCardMasked: maskIdCard(formData.idCard || ''),
        result: 'pending',
        message: '正在调用公安部"三要素"核验接口...',
        formData: formData
    });

    mockRealNameVerify(formData.name, formData.idCard).then(function(res) {
        setRetryCount(getRetryCount() + (res.passed ? 0 : 1));
        if (res.passed) {
            AppState.realNameStatus = 'verified';
            saveAppState();
            // 更新最后一条日志为"通过"
            updateLastLog({ result: 'passed', message: res.message });
        } else {
            AppState.realNameStatus = 'unverified';
            AppState.realNameFailMessage = res.message;
            saveAppState();
            updateLastLog({ result: 'failed', message: res.message });
        }
        if (typeof updateProfileUI === 'function') updateProfileUI();
        if (typeof window.onRealNameVerifyResult === 'function') {
            window.onRealNameVerifyResult(res);
        }
        if (res.passed && typeof executePendingAction === 'function') executePendingAction();
    });
}
function updateLastLog(patch) {
    var list = [];
    try { list = JSON.parse(localStorage.getItem(REALNAME_LOG_KEY) || '[]'); } catch (e) { list = []; }
    if (list.length > 0) {
        list[0] = Object.assign({}, list[0], patch);
        localStorage.setItem(REALNAME_LOG_KEY, JSON.stringify(list));
    }
}

// 企业认证提交：进入 pending_audit
function submitEnterpriseRealName(formData) {
    AppState.realNameStatus = 'pending_audit';
    saveAppState();
    appendRealNameLog({
        type: 'enterprise',
        name: formData.enterpriseName || '',
        idCardMasked: formData.enterpriseCode || '',
        result: 'pending',
        message: '企业认证已提交，等待管理员审核',
        formData: formData
    });
    if (typeof updateProfileUI === 'function') updateProfileUI();
    if (typeof window.onEnterpriseAuthSubmitted === 'function') {
        window.onEnterpriseAuthSubmitted(formData);
    }
}

// ====== 管理员干预：个人实名认证 ======
// 撤销已通过的个人认证
function adminRevertPersonalAuth(reason) {
    AppState.realNameStatus = 'unverified';
    AppState.realNameFailMessage = reason || '管理员已撤销您的个人实名认证';
    saveAppState();
    appendRealNameLog({
        name: (AppState.realNameData && AppState.realNameData.name) || '',
        idCardMasked: maskIdCard((AppState.realNameData && AppState.realNameData.idCard) || ''),
        result: 'failed',
        message: reason || '管理员撤销',
        auditBy: AppState.currentAdminName || '系统管理员',
        auditTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        auditMessage: reason,
        auditAction: 'admin_reverted'
    });
    if (typeof updateProfileUI === 'function') updateProfileUI();
    return true;
}
// 强制重新认证
function adminReverifyPersonalAuth(reason) {
    AppState.realNameStatus = 'unverified';
    AppState.realNameFailMessage = reason || '管理员已要求您重新进行实名认证';
    saveAppState();
    appendRealNameLog({
        name: (AppState.realNameData && AppState.realNameData.name) || '',
        idCardMasked: maskIdCard((AppState.realNameData && AppState.realNameData.idCard) || ''),
        result: 'pending',
        message: reason || '管理员强制重做',
        auditBy: AppState.currentAdminName || '系统管理员',
        auditTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        auditMessage: reason,
        auditAction: 'admin_reverify'
    });
    if (typeof updateProfileUI === 'function') updateProfileUI();
    return true;
}
// 人工通过（覆盖接口失败结果）
function adminApprovePersonalAuth(reason) {
    AppState.realNameStatus = 'verified';
    delete AppState.realNameFailMessage;
    saveAppState();
    appendRealNameLog({
        name: (AppState.realNameData && AppState.realNameData.name) || '',
        idCardMasked: maskIdCard((AppState.realNameData && AppState.realNameData.idCard) || ''),
        result: 'passed',
        message: '管理员人工核验通过',
        auditBy: AppState.currentAdminName || '系统管理员',
        auditTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        auditMessage: reason,
        auditAction: 'admin_approved'
    });
    if (typeof updateProfileUI === 'function') updateProfileUI();
    return true;
}
// 人工驳回（确认失败）
function adminRejectPersonalAuth(reason) {
    AppState.realNameStatus = 'unverified';
    AppState.realNameFailMessage = reason || '管理员已确认认证失败';
    saveAppState();
    appendRealNameLog({
        name: (AppState.realNameData && AppState.realNameData.name) || '',
        idCardMasked: maskIdCard((AppState.realNameData && AppState.realNameData.idCard) || ''),
        result: 'failed',
        message: reason || '管理员确认失败',
        auditBy: AppState.currentAdminName || '系统管理员',
        auditTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        auditMessage: reason,
        auditAction: 'admin_rejected'
    });
    if (typeof updateProfileUI === 'function') updateProfileUI();
    return true;
}

// ====== 管理员干预：企业认证 ======
// 审核通过
function adminApproveEnterpriseAuth(reason) {
    AppState.realNameStatus = 'enterprise_verified';
    delete AppState.realNameFailMessage;
    saveAppState();
    appendRealNameLog({
        type: 'enterprise',
        name: (AppState.realNameData && AppState.realNameData.enterpriseName) || '',
        idCardMasked: (AppState.realNameData && AppState.realNameData.enterpriseCode) || '',
        result: 'passed',
        message: '企业认证审核通过',
        auditBy: AppState.currentAdminName || '系统管理员',
        auditTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        auditMessage: reason || '',
        auditAction: 'admin_approved'
    });
    if (typeof updateProfileUI === 'function') updateProfileUI();
    return true;
}
// 审核驳回
function adminRejectEnterpriseAuth(reason) {
    AppState.realNameStatus = 'enterprise_rejected';
    AppState.realNameFailMessage = reason || '企业认证已驳回';
    saveAppState();
    appendRealNameLog({
        type: 'enterprise',
        name: (AppState.realNameData && AppState.realNameData.enterpriseName) || '',
        idCardMasked: (AppState.realNameData && AppState.realNameData.enterpriseCode) || '',
        result: 'failed',
        message: reason || '企业认证驳回',
        auditBy: AppState.currentAdminName || '系统管理员',
        auditTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        auditMessage: reason,
        auditAction: 'admin_rejected'
    });
    if (typeof updateProfileUI === 'function') updateProfileUI();
    return true;
}
// 撤销企业认证（已通过状态下）
function adminRevertEnterpriseAuth(reason) {
    AppState.realNameStatus = 'unverified';
    AppState.realNameFailMessage = reason || '管理员已撤销您的企业认证';
    saveAppState();
    appendRealNameLog({
        type: 'enterprise',
        name: (AppState.realNameData && AppState.realNameData.enterpriseName) || '',
        idCardMasked: (AppState.realNameData && AppState.realNameData.enterpriseCode) || '',
        result: 'failed',
        message: reason || '管理员撤销',
        auditBy: AppState.currentAdminName || '系统管理员',
        auditTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        auditMessage: reason,
        auditAction: 'admin_reverted'
    });
    if (typeof updateProfileUI === 'function') updateProfileUI();
    return true;
}
// 强制重做企业认证
function adminReverifyEnterpriseAuth(reason) {
    AppState.realNameStatus = 'unverified';
    AppState.realNameFailMessage = reason || '管理员已要求您重新提交企业认证';
    saveAppState();
    appendRealNameLog({
        type: 'enterprise',
        name: (AppState.realNameData && AppState.realNameData.enterpriseName) || '',
        idCardMasked: (AppState.realNameData && AppState.realNameData.enterpriseCode) || '',
        result: 'pending',
        message: reason || '管理员强制重做',
        auditBy: AppState.currentAdminName || '系统管理员',
        auditTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        auditMessage: reason,
        auditAction: 'admin_reverify'
    });
    if (typeof updateProfileUI === 'function') updateProfileUI();
    return true;
}


// ==================== 钱包模块（服务额度） ====================
// amount: 申请额度数值（可带 unit 字段："元"或"点"）
// paymentMethod: 支付方式（兼容旧值）
// extra: { type: 'recharge_request' | 'recharge' (默认), status, voucherName, unit }
function addBalance(amount, paymentMethod, extra) {
    amount = Number(amount) || 0;
    extra = extra || {};
    const isRequest = extra.type === 'recharge_request';
    // 申请模式：不直接加余额（保持数值），仅记录订单供后台审核
    if (!isRequest) {
        AppState.balance += amount;
    }
    saveAppState();
    // 生成订单
    var order = {
        id: 'ORD' + new Date().toISOString().slice(0,10).replace(/-/g,'') + String(Math.floor(Math.random()*900+100)),
        userId: AppState.user ? AppState.user.id : 0,
        userName: AppState.user ? AppState.user.name : '未知用户',
        type: extra.type || 'recharge',
        amount: amount + (extra.unit ? (' ' + extra.unit) : ''),
        unit: extra.unit || '',
        paymentMethod: paymentMethod || (isRequest ? '银行转账' : '在线支付'),
        status: extra.status || (isRequest ? '待审核' : '已完成'),
        time: new Date().toLocaleString('zh-CN',{hour12:false}),
        invoiceAvailable: !isRequest,
        voucherName: extra.voucherName || ''
    };
    var orders = getOrders();
    orders.push(order);
    saveOrders(orders);
    if (!isRequest) {
        showToast(`充值成功，当前可用额度 ${AppState.balance.toFixed(0)}`);
    }
    if (typeof updateProfileUI === 'function') {
        updateProfileUI();
    }
    if (!isRequest) {
        executePendingAction();
    }
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

// ==================== 需求对接 Mock 数据 ====================
// 业务状态：published（待承接）、taken（已承接，含进行中/需调整/已交付待验收，由 deliveryStage 区分）、completed（已完成）、off_shelf（已下架）
// 交付阶段（仅 taken 状态有效）：normal（待交付）、delivered（已交付待验收）、need_adjust（需调整）
// 审核状态：pending（待审核）、approved（已通过）、rejected（已驳回）
const SAMPLE_DEMANDS = [
    {
        id: 'DM20260601', title: '企业级智能客服系统搭建',
        description: '我们是一家电商平台（DAU 50万），希望搭建一套基于大模型的智能客服系统。需求：\n1. 支持多轮对话，能理解上下文\n2. 接入订单、物流、商品库数据\n3. 必要时无缝转人工',
        budget: '20万-30万', deadline: '2026-09-30', attachment: '',
        publisher: '陈雪', publisherId: 'enterprise-001',
        publisherContact: { company: '星辰科技有限公司', phone: '13900000001', email: 'chenxue@xingchen.tech' },
        createTime: '2026-06-01 10:30',
        status: 'published', auditStatus: 'approved',
        acceptor: '', acceptorId: '', acceptorContact: null, acceptTime: '',
        deliveryList: [], deliveryStage: 'normal', rejectReason: '', rejectTime: '',
        completeTime: ''
    },
    {
        id: 'DM20260602', title: '工业质检视觉模型定制',
        description: '需要为锂电池极片生产线定制一套视觉质检模型，识别准确率要求 ≥99.5%，单张图片推理时间 ≤200ms。',
        budget: '15万-25万', deadline: '2026-08-15', attachment: '需求规格书v2.pdf',
        publisher: '李明', publisherId: 'user-001',
        publisherContact: { company: '深圳某新能源公司', phone: '13800000002', email: 'liming@energy.com' },
        createTime: '2026-06-02 14:20',
        status: 'taken', auditStatus: 'approved', deliveryStage: 'normal',
        acceptor: '王芳', acceptorId: 'user-002', acceptTime: '2026-06-03 09:15',
        acceptorContact: { company: '自由职业 · AI 工程师', phone: '13700000002', email: 'wangfang@freelance.cn' },
        deliveryList: [], rejectReason: '', rejectTime: '', completeTime: ''
    },
    {
        id: 'DM20260603', title: 'AI辅助教学课件生成工具',
        description: '面向 K12 阶段老师，输入教材章节即可自动生成 PPT 大纲、例题、课后练习。希望支持数学、英语两个学科。',
        budget: '5万-8万', deadline: '2026-07-30', attachment: '',
        publisher: '周海', publisherId: 'enterprise-002',
        publisherContact: { company: '智源教育科技', phone: '13900000003', email: 'zhouhai@zhiyuan.edu' },
        createTime: '2026-06-03 16:45',
        status: 'taken', auditStatus: 'approved', deliveryStage: 'delivered',
        acceptor: '陈刚', acceptorId: 'user-003', acceptTime: '2026-06-04 11:20',
        acceptorContact: { company: '学而思网络科技', phone: '13600000003', email: 'chengang@xueersi.cn' },
        deliveryList: [
            { version: 1, content: '原型v0.1_20260615.zip', time: '2026-06-15 16:00' },
            { version: 2, content: '原型v0.3_20260620.zip', time: '2026-06-20 18:00' }
        ],
        rejectReason: '', rejectTime: '', completeTime: ''
    },
    {
        id: 'DM20260604', title: '金融研报自动摘要 PoC',
        description: '券商研究所场景，每日处理 200+ 份研报，自动生成 200 字摘要 + 关键观点提取。需保证数字、机构名零错误。',
        budget: '8万-12万', deadline: '2026-07-15', attachment: '',
        publisher: '黄琳', publisherId: 'enterprise-003',
        publisherContact: { company: '华兴证券研究部', phone: '13900000004', email: 'huanglin@huaxing.com' },
        createTime: '2026-06-05 09:10',
        status: 'taken', auditStatus: 'approved', deliveryStage: 'need_adjust',
        acceptor: '赵敏', acceptorId: 'user-004', acceptTime: '2026-06-05 15:30',
        acceptorContact: { company: '锐见数据科技', phone: '13500000004', email: 'zhaomin@ruijian.ai' },
        deliveryList: [
            { version: 1, content: '初版摘要模型v1.0_20260701.zip', time: '2026-07-01 14:00' }
        ],
        rejectReason: '数字偶有误识别（如 "3.5亿" 误为 "35亿"），请优化后重新提交。', rejectTime: '2026-07-03 10:30',
        completeTime: ''
    },
    {
        id: 'DM20260605', title: '医疗影像多病种辅助诊断',
        description: '需要构建一个支持 X 光、CT 多病种识别的辅助诊断模型。',
        budget: '50万-80万', deadline: '2026-12-31', attachment: '',
        publisher: '张伟', publisherId: 'user-005',
        publisherContact: { company: '某三甲医院信息中心', phone: '13800000005', email: 'zhangwei@hospital.cn' },
        createTime: '2026-06-06 08:30',
        status: 'off_shelf', auditStatus: 'rejected',
        acceptor: '', acceptorId: '', acceptorContact: null, acceptTime: '',
        deliveryList: [], deliveryStage: 'normal', rejectReason: '', rejectTime: '',
        completeTime: ''
    },
    {
        id: 'DM20260606', title: '营销短视频脚本批量生成',
        description: 'MCN 机构，需要日均产出 50 条 15 秒短视频脚本，要求风格多样、紧跟热点。',
        budget: '3万-5万', deadline: '2026-07-20', attachment: '',
        publisher: '张伟', publisherId: 'user-005',
        publisherContact: { company: '深圳某 MCN 机构', phone: '13800000006', email: 'zhangwei@mcn.com' },
        createTime: '2026-06-08 11:00',
        status: 'published', auditStatus: 'approved',
        acceptor: '', acceptorId: '', acceptorContact: null, acceptTime: '',
        deliveryList: [], deliveryStage: 'normal', rejectReason: '', rejectTime: '',
        completeTime: ''
    }
];

// 需求数据 CRUD（localStorage 模拟，三端共享）
function getDemands() {
    try {
        const raw = localStorage.getItem('opc_demands');
        if (raw) {
            const parsed = JSON.parse(raw);
            // 兼容老数据：补齐新字段
            parsed.forEach(function(d) {
                if (!d.publisherContact) d.publisherContact = null;
                if (!d.acceptorContact) d.acceptorContact = null;
                if (!d.deliveryList) d.deliveryList = [];
                if (!d.deliveryStage) d.deliveryStage = 'normal';
                if (d.rejectReason === undefined) d.rejectReason = '';
                if (d.rejectTime === undefined) d.rejectTime = '';
                // 老状态 in_progress 自动归并为 taken（保留 deliveryList）
                if (d.status === 'in_progress') d.status = 'taken';
            });
            return parsed;
        }
    } catch (e) { /* 忽略解析错误 */ }
    // 首次访问：写入初始 mock
    localStorage.setItem('opc_demands', JSON.stringify(SAMPLE_DEMANDS));
    return JSON.parse(JSON.stringify(SAMPLE_DEMANDS));
}

function saveDemands(list) {
    localStorage.setItem('opc_demands', JSON.stringify(list));
}

function getDemandById(id) {
    return getDemands().find(function(d) { return d.id === id; });
}

// 生成需求编号：DM+日期+3位序号
function generateDemandId() {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const list = getDemands();
    const sameDay = list.filter(function(d) { return d.id.indexOf('DM' + datePart) === 0; });
    const seq = String(sameDay.length + 1).padStart(3, '0');
    return 'DM' + datePart + seq;
}

// 取当前用户的联系信息（mock 推导）
function getCurrentContact() {
    const u = AppState.user;
    if (!u) return { company: '', phone: '', email: '' };
    return {
        company: u.company || (u.name ? (u.name + ' · 个人') : ''),
        phone: u.phone || '',
        email: u.email || ''
    };
}

// 发布需求
function addDemand(data) {
    const list = getDemands();
    const newDemand = {
        id: generateDemandId(),
        title: data.title || '',
        description: data.description || '',
        category: data.category || '其他',
        budget: data.budget || '',
        deadline: data.deadline || '',
        attachment: data.attachment || '',
        publisher: (AppState.user && AppState.user.name) || '匿名用户',
        publisherId: (AppState.user && AppState.user.id) || 'anonymous',
        publisherContact: getCurrentContact(),
        createTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        status: 'pending_audit',         // 进入审核流
        auditStatus: 'pending',          // 新发布需经审核
        auditMessage: '', auditTime: '',
        acceptor: '', acceptorId: '', acceptorContact: null, acceptTime: '',
        deliveryList: [], deliveryStage: 'normal',
        rejectReason: '', rejectTime: '',
        completeTime: ''
    };
    list.unshift(newDemand);  // 首位插入
    saveDemands(list);
    return newDemand;
}

// 承接需求
function acceptDemand(demandId) {
    const list = getDemands();
    const idx = list.findIndex(function(d) { return d.id === demandId; });
    if (idx === -1) return { ok: false, msg: '需求不存在' };
    const d = list[idx];
    if (d.status !== 'published') return { ok: false, msg: '该需求当前不可承接' };
    if (d.auditStatus !== 'approved') return { ok: false, msg: '该需求未通过审核' };
    // 不能承接自己发布的需求
    if (AppState.user && d.publisherId === AppState.user.id) {
        return { ok: false, msg: '不能承接自己发布的需求' };
    }
    d.status = 'taken';
    d.deliveryStage = 'normal';
    d.acceptor = (AppState.user && AppState.user.name) || '匿名用户';
    d.acceptorId = (AppState.user && AppState.user.id) || 'anonymous';
    d.acceptTime = new Date().toLocaleString('zh-CN', { hour12: false });
    d.acceptorContact = getCurrentContact();
    // 清空旧驳回记录（新一轮承接重置）
    d.rejectReason = '';
    d.rejectTime = '';
    saveDemands(list);
    return { ok: true, msg: '承接成功' };
}

// 管理员审核
function auditDemand(demandId, pass) {
    const list = getDemands();
    const d = list.find(function(x) { return x.id === demandId; });
    if (!d) return false;
    d.auditStatus = pass ? 'approved' : 'rejected';
    // 审核通过 → 顶层状态置为 approved（在主站展示）；驳回 → rejected（不展示并标记为已驳回）
    d.status = pass ? 'approved' : 'rejected';
    d.auditTime = new Date().toLocaleString('zh-CN', { hour12: false });
    saveDemands(list);
    return true;
}

// 管理员下架（已上架需求）
function offShelfDemand(demandId) {
    const list = getDemands();
    const d = list.find(function(x) { return x.id === demandId; });
    if (!d) return false;
    d.status = 'off_shelf';
    saveDemands(list);
    return true;
}

// 发布者下架自己的需求
function publisherOffShelf(demandId) {
    const list = getDemands();
    const d = list.find(function(x) { return x.id === demandId; });
    if (!d) return false;
    d.status = 'off_shelf';
    saveDemands(list);
    return true;
}

// 承接者提交/更新交付物（追加为新版本）
function submitDelivery(demandId, deliveryText) {
    const list = getDemands();
    const d = list.find(function(x) { return x.id === demandId; });
    if (!d) return false;
    if (!d.deliveryList) d.deliveryList = [];
    const nextVersion = d.deliveryList.length + 1;
    d.deliveryList.push({
        version: nextVersion,
        content: deliveryText || '',
        time: new Date().toLocaleString('zh-CN', { hour12: false })
    });
    d.deliveryStage = 'delivered';  // 提交后即进入"已交付待验收"
    d.rejectReason = '';
    d.rejectTime = '';
    saveDemands(list);
    return true;
}

// 发布者驳回交付物
function rejectDelivery(demandId, reason) {
    const list = getDemands();
    const d = list.find(function(x) { return x.id === demandId; });
    if (!d) return false;
    d.deliveryStage = 'need_adjust';
    d.rejectReason = reason || '需调整，请优化后重新提交';
    d.rejectTime = new Date().toLocaleString('zh-CN', { hour12: false });
    saveDemands(list);
    return true;
}

// 发布者验收通过
function verifyDelivery(demandId) {
    const list = getDemands();
    const d = list.find(function(x) { return x.id === demandId; });
    if (!d) return false;
    d.deliveryStage = 'verified';
    saveDemands(list);
    return true;
}

// 标记完成（发布者确认，且交付阶段必须是 verified 或 delivered）
function markCompleted(demandId) {
    const list = getDemands();
    const d = list.find(function(x) { return x.id === demandId; });
    if (!d) return false;
    if (d.deliveryStage !== 'verified' && d.deliveryStage !== 'delivered') {
        return { ok: false, msg: '请先验收交付物' };
    }
    d.deliveryStage = 'verified';
    d.status = 'completed';
    d.completeTime = new Date().toLocaleString('zh-CN', { hour12: false });
    saveDemands(list);
    return { ok: true, msg: '已标记完成' };
}

// 编辑需求（发布者本人）
function updateDemand(demandId, data) {
    const list = getDemands();
    const d = list.find(function(x) { return x.id === demandId; });
    if (!d) return false;
    if (data.title !== undefined) d.title = data.title;
    if (data.description !== undefined) d.description = data.description;
    if (data.budget !== undefined) d.budget = data.budget;
    if (data.deadline !== undefined) d.deadline = data.deadline;
    if (data.attachment !== undefined) d.attachment = data.attachment;
    saveDemands(list);
    return true;
}

// 业务状态中文映射（顶层状态：pending_audit/approved/rejected/off_shelf；published/taken/completed 为兼容旧数据）
const DEMAND_STATUS_MAP = {
    pending_audit: '审核中',
    approved: '已发布',
    rejected: '已驳回',
    published: '待承接',
    taken: '已承接',
    completed: '已完成',
    off_shelf: '已下架'
};
const DEMAND_AUDIT_MAP = {
    pending: '待审核', approved: '已通过', rejected: '已驳回'
};
// 业务状态徽章样式
const DEMAND_STATUS_BADGE = {
    pending_audit: 'bg-amber-50 text-amber-700',
    approved: 'bg-green-50 text-green-700',
    rejected: 'bg-red-50 text-red-700',
    published: 'bg-green-50 text-green-700',
    taken: 'bg-blue-50 text-blue-700',
    completed: 'bg-gray-100 text-gray-600',
    off_shelf: 'bg-red-50 text-red-700'
};
const DEMAND_AUDIT_BADGE = {
    pending: 'bg-amber-50 text-amber-700',
    approved: 'bg-green-50 text-green-700',
    rejected: 'bg-red-50 text-red-700'
};
// 交付阶段（仅在 status=taken 时展示）
const DEMAND_DELIVERY_STAGE_MAP = {
    normal: '待交付',
    delivered: '已交付待验收',
    need_adjust: '需调整',
    verified: '已验收'
};
const DEMAND_DELIVERY_STAGE_BADGE = {
    normal: 'bg-gray-100 text-gray-500',
    delivered: 'bg-amber-50 text-amber-700',
    need_adjust: 'bg-red-50 text-red-700',
    verified: 'bg-green-50 text-green-700'
};

// ==================== 需求详情弹窗（共用） ====================
// HTML 转义
function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// 状态/阶段/审核 辅助
function statusBadgeClass(s) { return DEMAND_STATUS_BADGE[s] || 'bg-gray-50 text-gray-600'; }
function statusLabel(s) { return DEMAND_STATUS_MAP[s] || s; }
function auditBadgeClass(s) { return DEMAND_AUDIT_BADGE[s] || 'bg-gray-50 text-gray-600'; }
function auditLabel(s) { return DEMAND_AUDIT_MAP[s] || s; }
function stageBadgeClass(s) { return DEMAND_DELIVERY_STAGE_BADGE[s] || 'bg-gray-100 text-gray-500'; }
function stageLabel(s) { return DEMAND_DELIVERY_STAGE_MAP[s] || ''; }

// 渲染联系方式卡片
function renderContactBlock(role, name, contact) {
    const labelColor = role === 'publisher' ? 'text-blue-600' : 'text-green-600';
    const bgColor = role === 'publisher' ? 'bg-blue-50' : 'bg-green-50';
    const roleText = role === 'publisher' ? '需求方（甲方）' : '承接方（乙方）';
    if (!contact || !contact.phone) {
        return '<div class="text-xs text-gray-400">该方未提供联系方式</div>';
    }
    return ''
        + '<div class="text-xs ' + labelColor + ' font-semibold mb-1.5">' + roleText + '</div>'
        + '<div class="space-y-1.5 text-sm">'
        + '  <div class="flex items-center gap-2"><i class="fas fa-user-circle text-gray-400 w-4"></i><span class="text-gray-800 font-medium">' + escapeHtml(name) + '</span></div>'
        + '  <div class="flex items-center gap-2"><i class="fas fa-building text-gray-400 w-4"></i><span class="text-gray-700">' + escapeHtml(contact.company || '个人') + '</span></div>'
        + '  <div class="flex items-center gap-2"><i class="fas fa-phone text-gray-400 w-4"></i><span class="text-gray-700 font-mono">' + escapeHtml(contact.phone) + '</span>'
        + '    <button onclick="copyText(\'' + escapeHtml(contact.phone) + '\')" class="text-xs text-primary hover:text-primary-dark ml-1">复制</button></div>'
        + '  <div class="flex items-center gap-2"><i class="fas fa-envelope text-gray-400 w-4"></i><span class="text-gray-700">' + escapeHtml(contact.email) + '</span>'
        + '    <button onclick="copyText(\'' + escapeHtml(contact.email) + '\')" class="text-xs text-primary hover:text-primary-dark ml-1">复制</button></div>'
        + '</div>';
}

// 渲染交付历史时间线
function renderDeliveryTimeline(deliveryList, rejectReason, rejectTime) {
    if (!deliveryList || !deliveryList.length) {
        return '<div class="text-sm text-gray-400 italic">尚未提交交付物</div>';
    }
    const items = deliveryList.map(function(dlv) {
        return ''
            + '<div class="flex items-start gap-3 mb-3 last:mb-0">'
            + '  <div class="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">v' + dlv.version + '</div>'
            + '  <div class="flex-1 min-w-0">'
            + '    <div class="flex items-center gap-2 flex-wrap"><span class="text-sm font-medium text-gray-800">' + escapeHtml(dlv.content) + '</span><span class="text-xs text-gray-400">' + escapeHtml(dlv.time) + '</span></div>'
            + '  </div>'
            + '</div>';
    }).join('');
    const rejectBlock = rejectReason
        ? '<div class="mt-3 p-3 rounded-lg bg-red-50 border border-red-100"><div class="text-xs font-semibold text-red-700 mb-1"><i class="fas fa-exclamation-circle mr-1"></i>需调整</div><div class="text-sm text-red-800">' + escapeHtml(rejectReason) + (rejectTime ? '<div class="text-xs text-red-500 mt-1">' + escapeHtml(rejectTime) + '</div>' : '') + '</div></div>'
        : '';
    return '<div class="space-y-0">' + items + '</div>' + rejectBlock;
}

// 复制到剪贴板
function copyText(t) {
    try {
        if (navigator.clipboard) { navigator.clipboard.writeText(t); showToast('已复制：' + t, 'success'); }
        else { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast('已复制', 'success'); }
    } catch (e) { showToast('复制失败', 'error'); }
}

// 打开需求详情弹窗（共用，挂到 window）
// 需求信息页：仅展示需求信息 + 需求方联系方式；不显示承接/交付相关
// 依赖页面 DOM：#demandDetailOverlay / #demandDetailTitle / #demandDetailBody
window.openDemandDetail = function(id) {
    const d = (typeof getDemandById === 'function') ? getDemandById(id) : null;
    if (!d) { if (typeof showToast === 'function') showToast('需求不存在', 'error'); return; }
    const overlay = document.getElementById('demandDetailOverlay');
    const bodyEl = document.getElementById('demandDetailBody');
    const titleEl = document.getElementById('demandDetailTitle');
    if (!overlay || !bodyEl || !titleEl) {
        if (typeof showToast === 'function') showToast('详情弹窗容器缺失', 'error');
        return;
    }
    bodyEl.innerHTML = ''
        + '<div class="flex items-center space-x-2 flex-wrap gap-2">'
        + '  <span class="text-xs px-2.5 py-1 rounded-full ' + statusBadgeClass(d.status) + '">' + statusLabel(d.status) + '</span>'
        + '  <span class="text-xs px-2.5 py-1 rounded-full ' + auditBadgeClass(d.auditStatus) + '">审核：' + auditLabel(d.auditStatus) + '</span>'
        + '  <span class="text-xs text-gray-400 font-mono">' + d.id + '</span>'
        + '</div>'
        + '<h2 class="text-xl font-bold text-secondary">' + escapeHtml(d.title) + '</h2>'
        // 基本信息
        + '<div class="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-4">'
        + '  <div><span class="text-gray-500">发布人：</span><span class="text-gray-800 font-medium">' + escapeHtml(d.publisher) + '</span></div>'
        + '  <div><span class="text-gray-500">发布时间：</span><span class="text-gray-800">' + escapeHtml(d.createTime) + '</span></div>'
        + '  <div><span class="text-gray-500">需求类型：</span><span class="text-gray-800">' + escapeHtml(d.category || '其他') + '</span></div>'
        + '  <div><span class="text-gray-500">预算范围：</span><span class="text-gray-800 font-medium">' + escapeHtml(d.budget || '面议') + '</span></div>'
        + '  <div><span class="text-gray-500">期望完成：</span><span class="text-gray-800">' + escapeHtml(d.deadline || '不限') + '</span></div>'
        + (d.auditTime ? '<div><span class="text-gray-500">审核时间：</span><span class="text-gray-800">' + escapeHtml(d.auditTime) + '</span></div>' : '')
        + '</div>'
        // 需求描述
        + '<div><h4 class="text-sm font-semibold text-gray-700 mb-2">需求描述</h4><div class="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-4 leading-relaxed">' + escapeHtml(d.description) + '</div></div>'
        // 需求文档/附件
        + '<div><h4 class="text-sm font-semibold text-gray-700 mb-2"><i class="fas fa-paperclip mr-1.5"></i>需求文档/附件</h4>'
        + (d.attachment
            ? '<div class="flex items-center gap-2 p-3 bg-gray-50 rounded-lg text-sm"><i class="fas fa-file text-primary"></i><span class="text-gray-700 flex-1">' + escapeHtml(d.attachment) + '</span><span class="text-xs text-gray-400">仅记录文件名（原型）</span></div>'
            : '<div class="text-sm text-gray-400 italic">未提供附件</div>')
        + '</div>'
        // 需求方联系方式（最显眼）
        + '<div><h4 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-id-card mr-1.5"></i>需求方联系方式（可直接联系沟通）</h4>'
        + '<div class="rounded-lg p-4 border border-blue-200 bg-blue-50/60">'
        +    renderContactBlock("publisher", d.publisher, d.publisherContact)
        + '</div>'
        + '<p class="text-xs text-gray-400 mt-2"><i class="fas fa-info-circle mr-1"></i>本平台仅提供需求信息展示与对接通道，具体合作请自行沟通。</p>'
        + '</div>'
        // 操作
        + '<div class="flex justify-end space-x-3 pt-2 border-t border-gray-100"><button onclick="closeDemandDetail()" class="px-5 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">关闭</button></div>';
    titleEl.textContent = d.title;
    if (typeof openModal === 'function') openModal('demandDetailOverlay');
};
window.closeDemandDetail = function() { if (typeof closeModal === 'function') closeModal('demandDetailOverlay'); };
// 兼容旧调用：详情弹窗内不再有"立即承接"，但保留函数以防页面内有遗留引用（不进行实际操作）
window.handleAcceptFromDetail = function(id) {
    if (typeof showToast === 'function') showToast('请通过需求方联系方式自行沟通', 'info');
    closeDemandDetail();
};
window.__doAcceptFromDetail = function() { /* 保留以兼容 */ };

// ==================== 应用广场-服务申请（独立于服务申请记录） ====================
// 数据 localStorage key: opc_app_applications
// 状态：pending_contact(待对接) / contacted(已联系) / completed(已完成)
function getAppApplications() {
    try { return JSON.parse(localStorage.getItem('opc_app_applications')) || []; }
    catch (e) { return []; }
}
function saveAppApplications(list) {
    localStorage.setItem('opc_app_applications', JSON.stringify(list || []));
}
function getAppApplicationById(id) {
    return getAppApplications().find(function(a) { return a.id === id; });
}
function generateAppApplicationId() {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const list = getAppApplications();
    const sameDay = list.filter(function(a) { return a.id.indexOf('APP' + datePart) === 0; });
    const seq = String(sameDay.length + 1).padStart(3, '0');
    return 'APP' + datePart + seq;
}
function addAppApplication(data) {
    const list = getAppApplications();
    const u = AppState.user;
    const item = {
        id: generateAppApplicationId(),
        appName: data.appName || '',
        description: data.description || '',
        userId: (u && u.id) || 'anonymous',
        userName: (u && u.name) || '匿名用户',
        userPhone: (u && u.phone) || '',
        userCompany: (u && u.company) || '',
        createTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        status: 'pending_contact',  // 待对接
        contactTime: '',
        completeTime: ''
    };
    list.unshift(item);
    saveAppApplications(list);
    return item;
}
function updateAppApplicationStatus(id, status) {
    const list = getAppApplications();
    const a = list.find(function(x) { return x.id === id; });
    if (!a) return false;
    a.status = status;
    if (status === 'contacted') a.contactTime = new Date().toLocaleString('zh-CN', { hour12: false });
    if (status === 'completed') a.completeTime = new Date().toLocaleString('zh-CN', { hour12: false });
    saveAppApplications(list);
    return true;
}
// 状态映射（供多端共用）
const APP_APP_STATUS_MAP = {
    pending_contact: '待对接',
    contacted: '已联系',
    completed: '已完成'
};
const APP_APP_STATUS_BADGE = {
    pending_contact: 'bg-amber-50 text-amber-700',
    contacted: 'bg-blue-50 text-blue-700',
    completed: 'bg-green-50 text-green-700'
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
    checkLoginStatus();
    // 初始化需求 mock（如果尚未写入）
    if (!localStorage.getItem('opc_demands')) {
        localStorage.setItem('opc_demands', JSON.stringify(SAMPLE_DEMANDS));
    }
    // 页面加载时不清除待办动作，仅在认证/充值/登录成功后执行
    // 避免 profile.html 加载时自动触发 services.html 的回调函数
});
