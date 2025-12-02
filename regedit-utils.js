const { v4: uuidv4 } = require('uuid');
const { execSync } = require('child_process');
const REGISTRY_PATH = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography';

/**
 * 读取注册表中的MachineGuid值
 * @returns {Promise<string|null>} 返回MachineGuid值，失败时返回null
 */
async function getMachineGuid() {
  try {
    console.log('正在读取注册表MachineGuid...');
    
    // 使用 reg query 命令读取注册表
    const command = `reg query "${REGISTRY_PATH}" /v MachineGuid`;
    const output = execSync(command, { encoding: 'utf8' });
    
    // 解析输出，格式类似：
    // MachineGuid    REG_SZ    {GUID}
    const match = output.match(/MachineGuid\s+REG_SZ\s+(.+)/);
    if (!match || !match[1]) {
      throw new Error('无法解析 MachineGuid 值');
    }
    
    const machineGuid = match[1].trim();
    console.log(`当前注册表MachineGuid: ${machineGuid}`);
    return machineGuid;
  } catch (error) {
    if (error.message && error.message.includes('拒绝访问')) {
      console.error('[ERROR] 读取注册表失败: 请以管理员身份运行');
      return null;
    }
    console.error('[ERROR] 读取注册表MachineGuid失败:', error.message);
    return null;
  }
}

/**
 * 写入新的MachineGuid值到注册表
 * @returns {Promise<string|null>} 返回新生成的MachineGuid值，失败时返回null
 */
async function setMachineGuid() {
  try {
    const newValue = uuidv4();
    console.log(`正在设置新的注册表MachineGuid: ${newValue}`);
    
    // 使用 reg add 命令写入注册表（需要管理员权限）
    const command = `reg add "${REGISTRY_PATH}" /v MachineGuid /t REG_SZ /d "${newValue}" /f`;
    execSync(command, { encoding: 'utf8' });
    
    console.log('✓ 注册表MachineGuid设置成功');
    return newValue;
  } catch (error) {
    if (error.message && error.message.includes('拒绝访问')) {
      console.error('[ERROR] 写入注册表失败: 请以管理员身份运行');
      return null;
    }
    console.error('[ERROR] 写入注册表MachineGuid失败:', error.message);
    return null;
  }
}

/**
 * 重置注册表中的MachineGuid
 * 先读取当前值，然后设置新值
 * @returns {Promise<{success: boolean, oldValue?: string, newValue?: string, error?: string}>}
 */
async function resetMachineGuid() {
  try {
    console.log('开始重置注册表MachineGuid...');
    
    // 先读取当前值（可选，失败不影响设置新值）
    const oldValue = await getMachineGuid();
    
    // 设置新值
    const newValue = await setMachineGuid();
    
    if (newValue) {
      console.log(`✓ 注册表MachineGuid重置成功: ${oldValue || '未知'} -> ${newValue}`);
      return {
        success: true,
        oldValue: oldValue || '未知',
        newValue: newValue
      };
    } else {
      // 如果设置失败，检查是否是权限问题
      throw new Error('请以管理员身份运行程序');
    }
  } catch (error) {
    const errorMsg = error.message || '未知错误';
    console.error('[ERROR] 重置注册表MachineGuid失败:', errorMsg);
    
    return {
      success: false,
      error: errorMsg.includes('管理员') ? '请以管理员身份运行程序' : errorMsg
    };
  }
}

module.exports = {
  getMachineGuid,
  setMachineGuid,
  resetMachineGuid
}; 