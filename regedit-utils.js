const regedit = require('regedit');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// 尝试导入electron的app模块，如果不在electron环境中则为undefined
let app;
try {
  const electron = require('electron');
  app = electron.app;
} catch (error) {
  // 不在Electron环境中，app为undefined
  app = undefined;
}

// 配置 regedit 在打包环境中的工作目录
if (app && app.isPackaged) {
  // 设置 VBS 脚本的外部路径（在 asarUnpack 目录中）
  const vbsDirectory = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    'regedit',
    'vbs'
  );
  regedit.setExternalVBSLocation(vbsDirectory);
}

const pmsRegedit = regedit.promisified;
const REGISTRY_PATH = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography';

/**
 * 读取注册表中的MachineGuid值
 * @returns {Promise<string|null>} 返回MachineGuid值，失败时返回null
 */
async function getMachineGuid() {
  try {
    console.log('正在读取注册表MachineGuid...');
    const result = await pmsRegedit.list([REGISTRY_PATH]);
    
    if (!result || !result[REGISTRY_PATH]) {
      throw new Error('注册表路径不存在或无法访问');
    }
    
    const values = result[REGISTRY_PATH].values;
    if (!values || !values['MachineGuid']) {
      throw new Error('MachineGuid 值不存在');
    }
    
    const machineGuid = values['MachineGuid'].value;
    console.log(`当前注册表MachineGuid: ${machineGuid}`);
    return machineGuid;
  } catch (error) {
    console.error('读取注册表MachineGuid失败:', {
      error: error.message,
      isPackaged: app ? app.isPackaged : false,
      resourcesPath: (app && app.isPackaged) ? process.resourcesPath : 'development'
    });
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
    
    await pmsRegedit.putValue({
      [REGISTRY_PATH]: {
        MachineGuid: {
          value: newValue,
          type: 'REG_SZ'
        }
      }
    });
    
    console.log('注册表MachineGuid设置成功');
    return newValue;
  } catch (error) {
    console.error('写入注册表MachineGuid失败:', {
      error: error.message,
      isPackaged: app ? app.isPackaged : false,
      resourcesPath: (app && app.isPackaged) ? process.resourcesPath : 'development'
    });
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
    
    // 先读取当前值
    const oldValue = await getMachineGuid();
    
    // 设置新值
    const newValue = await setMachineGuid();
    
    if (newValue) {
      console.log(`注册表MachineGuid重置成功: ${oldValue} -> ${newValue}`);
      return {
        success: true,
        oldValue: oldValue || '未知',
        newValue: newValue
      };
    } else {
      throw new Error('设置新的MachineGuid失败');
    }
  } catch (error) {
    console.error('重置注册表MachineGuid失败:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  getMachineGuid,
  setMachineGuid,
  resetMachineGuid
}; 