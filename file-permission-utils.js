const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

/**
 * 检查文件是否为只读
 * @param {string} filePath 文件路径
 * @returns {Promise<boolean>} 是否为只读
 */
async function isFileReadOnly(filePath) {
  try {
    if (process.platform === 'win32') {
      // Windows系统使用attrib命令检查只读属性
      const { stdout } = await execAsync(`attrib "${filePath}"`);
      // 检查输出中是否包含R属性（可能在任何位置）
      return stdout.includes('R');
    } else {
      // Unix/Linux系统检查文件权限
      const stats = fs.statSync(filePath);
      return !(stats.mode & parseInt('200', 8));
    }
  } catch (error) {
    console.warn('检查文件只读属性失败:', error.message);
    return false;
  }
}

/**
 * 移除文件的只读属性
 * @param {string} filePath 文件路径
 * @returns {Promise<boolean>} 是否成功
 */
async function removeReadOnlyAttribute(filePath) {
  try {
    if (process.platform === 'win32') {
      // Windows系统使用attrib命令移除只读属性
      console.log(`正在移除文件只读属性: ${filePath}`);
      await execAsync(`attrib -R "${filePath}"`);
      console.log('只读属性移除成功');
      return true;
    } else {
      // Unix/Linux系统添加写权限
      const stats = fs.statSync(filePath);
      fs.chmodSync(filePath, stats.mode | parseInt('200', 8));
      console.log('写权限添加成功');
      return true;
    }
  } catch (error) {
    console.error('移除只读属性失败:', error.message);
    return false;
  }
}

/**
 * 恢复文件的只读属性
 * @param {string} filePath 文件路径
 * @returns {Promise<boolean>} 是否成功
 */
async function restoreReadOnlyAttribute(filePath) {
  try {
    if (process.platform === 'win32') {
      // Windows系统使用attrib命令设置只读属性
      console.log(`正在恢复文件只读属性: ${filePath}`);
      await execAsync(`attrib +R "${filePath}"`);
      console.log('只读属性恢复成功');
      return true;
    } else {
      // Unix/Linux系统移除写权限
      const stats = fs.statSync(filePath);
      fs.chmodSync(filePath, stats.mode & ~parseInt('200', 8));
      console.log('写权限移除成功，文件已设为只读');
      return true;
    }
  } catch (error) {
    console.error('恢复只读属性失败:', error.message);
    return false;
  }
}

/**
 * 安全地修改文件（自动处理只读属性）
 * @param {string} filePath 文件路径
 * @param {function} modifyFunction 修改文件的函数
 * @returns {Promise<boolean>} 是否成功
 */
async function safeModifyFile(filePath, modifyFunction) {
  let wasReadOnly = false;
  
  try {
    // 检查文件是否为只读
    wasReadOnly = await isFileReadOnly(filePath);
    
    // 如果是只读，先移除只读属性
    if (wasReadOnly) {
      const removeSuccess = await removeReadOnlyAttribute(filePath);
      if (!removeSuccess) {
        throw new Error('无法移除文件只读属性');
      }
    }
    
    // 执行文件修改操作
    await modifyFunction();
    
    // 不再恢复只读属性，保持文件可写状态
    return true;
  } catch (error) {
    console.error('安全修改文件失败:', error.message);
    
    // 如果修改失败但已经移除了只读属性，尝试恢复
    if (wasReadOnly) {
      try {
        await restoreReadOnlyAttribute(filePath);
      } catch (restoreError) {
        console.error('恢复只读属性失败:', restoreError.message);
      }
    }
    
    return false;
  }
}

module.exports = {
  isFileReadOnly,
  removeReadOnlyAttribute,
  restoreReadOnlyAttribute,
  safeModifyFile
}; 