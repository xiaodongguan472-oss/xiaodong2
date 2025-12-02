/**
 * Kiro 账号认证模块
 * 负责：
 * 1. 使用 refreshToken + clientId + clientSecret 调用 AWS SSO OIDC 获取 accessToken
 * 2. 将认证数据写入 ~/.aws/sso/cache/kiro-auth-token.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const crypto = require('crypto');

// AWS SSO OIDC 端点
const OIDC_ENDPOINT = 'oidc.us-east-1.amazonaws.com';

/**
 * 获取 kiro-auth-token.json 文件路径
 * Windows: C:\Users\用户名\.aws\sso\cache\kiro-auth-token.json
 * macOS/Linux: ~/.aws/sso/cache/kiro-auth-token.json
 */
function getKiroAuthTokenPath() {
    const homeDir = os.homedir();
    const awsSsoPath = path.join(homeDir, '.aws', 'sso', 'cache');
    return path.join(awsSsoPath, 'kiro-auth-token.json');
}

/**
 * 确保目录存在
 */
function ensureDirectoryExists(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✓ 创建目录: ${dir}`);
    }
}

/**
 * 发送 HTTPS POST 请求
 */
function httpsPost(hostname, path, data) {
    return new Promise((resolve, reject) => {
        const jsonData = JSON.stringify(data);
        
        const options = {
            hostname: hostname,
            port: 443,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Content-Length': Buffer.byteLength(jsonData)
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseData);
                    resolve({
                        statusCode: res.statusCode,
                        data: parsed
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        data: responseData
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('请求超时'));
        });

        req.write(jsonData);
        req.end();
    });
}

/**
 * 使用 refreshToken 获取新的 accessToken
 * 参考 kiro_refresh.py 的实现
 */
async function refreshToken(clientId, clientSecret, refreshToken) {
    console.log('\n========== 步骤1: 刷新 Token ==========');
    
    const payload = {
        clientId: clientId,
        clientSecret: clientSecret,
        refreshToken: refreshToken,
        grantType: 'refresh_token'
    };

    try {
        const response = await httpsPost(OIDC_ENDPOINT, '/token', payload);
        
        if (response.statusCode === 200) {
            const data = response.data;
            
            const accessToken = data.accessToken;
            const newRefreshToken = data.refreshToken || refreshToken;
            const expiresIn = data.expiresIn || 3600;
            
            // 计算过期时间（ISO 格式）
            const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
            
            console.log('✅ Token 刷新成功!');
            console.log(`   Access Token: ${accessToken.substring(0, 50)}...`);
            console.log(`   过期时间: ${expiresIn} 秒 (${Math.floor(expiresIn / 60)} 分钟)`);
            console.log(`   过期于: ${expiresAt}`);
            
            // 检查 refreshToken 是否更新
            if (newRefreshToken !== refreshToken) {
                console.log('   ⚠️ Refresh Token 已更新!');
            }
            
            return {
                success: true,
                accessToken: accessToken,
                refreshToken: newRefreshToken,
                expiresIn: expiresIn,
                expiresAt: expiresAt
            };
        } else {
            console.error(`❌ 刷新失败: ${response.statusCode}`);
            console.error(`   响应: ${JSON.stringify(response.data).substring(0, 200)}`);
            return {
                success: false,
                message: `Token 刷新失败: ${response.statusCode}`
            };
        }
    } catch (error) {
        console.error(`❌ 请求异常: ${error.message}`);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * 计算字符串的 SHA1 哈希值
 */
function sha1Hash(str) {
    return crypto.createHash('sha1').update(str).digest('hex');
}

/**
 * 将认证数据写入 kiro-auth-token.json
 * 格式：
 * {
 *   "refreshToken": "...",
 *   "accessToken": "...",
 *   "expiresAt": "2025-12-01T11:03:43.000Z",
 *   "clientIdHash": "fe42de6e9e88ee8bd3796e591bc6c860a3774d4e",
 *   "authMethod": "IdC",
 *   "provider": "BuilderId",
 *   "region": "us-east-1"
 * }
 */
function writeKiroAuthToken(tokenData, clientId) {
    const filePath = getKiroAuthTokenPath();
    
    console.log('\n========== 步骤2: 写入认证文件 ==========');
    console.log(`文件路径: ${filePath}`);
    
    try {
        // 确保目录存在
        ensureDirectoryExists(filePath);
        
        // 计算 clientId 的 SHA1 哈希值
        const clientIdHash = sha1Hash(clientId);
        
        // 构建要写入的数据
        const authData = {
            refreshToken: tokenData.refreshToken,
            accessToken: tokenData.accessToken,
            expiresAt: tokenData.expiresAt,
            clientIdHash: clientIdHash,
            authMethod: 'IdC',
            provider: 'BuilderId',
            region: 'us-east-1'
        };
        
        // 写入文件
        fs.writeFileSync(filePath, JSON.stringify(authData, null, 2), 'utf8');
        
        console.log('✅ 认证文件写入成功!');
        console.log(`   refreshToken: ${authData.refreshToken.substring(0, 50)}...`);
        console.log(`   accessToken: ${authData.accessToken.substring(0, 50)}...`);
        console.log(`   expiresAt: ${authData.expiresAt}`);
        console.log(`   clientIdHash: ${authData.clientIdHash}`);
        console.log(`   authMethod: ${authData.authMethod}`);
        console.log(`   provider: ${authData.provider}`);
        console.log(`   region: ${authData.region}`);
        
        return true;
    } catch (error) {
        console.error(`❌ 写入文件失败: ${error.message}`);
        throw error;
    }
}

/**
 * 完整的换号流程
 * @param {string} email - 邮箱
 * @param {string} refreshTokenValue - Refresh Token
 * @param {string} clientId - Client ID
 * @param {string} clientSecret - Client Secret
 */
async function switchAccount(email, refreshTokenValue, clientId, clientSecret) {
    console.log(`\n========================================`);
    console.log(`开始 Kiro 账号切换流程`);
    console.log(`邮箱: ${email}`);
    console.log(`========================================\n`);

    try {
        // 1. 验证必要参数
        console.log('[模式] 使用 AWS SSO OIDC 刷新 Token');
        
        if (!refreshTokenValue) {
            throw new Error('缺少 refreshToken 参数');
        }
        if (!clientId) {
            throw new Error('缺少 clientId 参数');
        }
        if (!clientSecret) {
            throw new Error('缺少 clientSecret 参数');
        }
        
        console.log('✓ 参数验证通过');
        console.log(`   Client ID: ${clientId.substring(0, 20)}...`);
        console.log(`   Refresh Token: ${refreshTokenValue.substring(0, 30)}...`);

        // 2. 调用 AWS SSO OIDC 刷新 Token
        const tokenResult = await refreshToken(
            clientId,
            clientSecret,
            refreshTokenValue
        );
        
        if (!tokenResult.success) {
            throw new Error(tokenResult.message || 'Token 刷新失败');
        }

        // 3. 写入 kiro-auth-token.json（传入 clientId 用于计算哈希）
        writeKiroAuthToken(tokenResult, clientId);

        console.log(`\n========================================`);
        console.log(`✓ Kiro 账号切换成功！`);
        console.log(`请重启 Kiro 使新账号生效`);
        console.log(`========================================\n`);

        return {
            success: true,
            email: email,
            accessToken: tokenResult.accessToken,
            refreshToken: tokenResult.refreshToken,
            expiresAt: tokenResult.expiresAt
        };

    } catch (error) {
        console.error(`\n========================================`);
        console.error(`✗ Kiro 账号切换失败`);
        console.error(`错误: ${error.message}`);
        console.error(`========================================\n`);

        return {
            success: false,
            message: error.message
        };
    }
}

module.exports = {
    refreshToken,
    writeKiroAuthToken,
    getKiroAuthTokenPath,
    switchAccount
};
