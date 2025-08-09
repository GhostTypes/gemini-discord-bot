/**
 * @fileoverview Operator authentication service for Discord bot access control.
 * 
 * This service manages a hierarchical operator system with:
 * - Primary Operator: Single user ID from environment variable, cannot be removed
 * - Sub-Operators: JSON file-based storage, managed by primary operator only
 * - Authentication: Check if users are authorized for protected commands
 * 
 * Features:
 * - JSON-based storage similar to channel whitelist system
 * - Thread-safe file operations with error handling
 * - Singleton pattern for consistent state management
 * - Hierarchical permissions (primary > sub-operators)
 * - Comprehensive logging and validation
 * 
 * File Format (operators.json):
 * {
 *   "operators": ["user_id_1", "user_id_2"],
 *   "lastModified": "2024-01-01T00:00:00.000Z"
 * }
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';
import { botConfig } from '../config/environment.js';

interface OperatorData {
  operators: string[];
  lastModified: string | null;
}

export class OperatorService {
  private static readonly OPERATORS_FILE = path.join(process.cwd(), 'operators.json');
  private static instance: OperatorService;
  private operatorData: OperatorData = { operators: [], lastModified: null };
  private isLoaded = false;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): OperatorService {
    if (!OperatorService.instance) {
      OperatorService.instance = new OperatorService();
    }
    return OperatorService.instance;
  }

  /**
   * Load operator data from JSON file
   */
  private async loadOperators(): Promise<void> {
    try {
      const data = await fs.readFile(OperatorService.OPERATORS_FILE, 'utf-8');
      this.operatorData = JSON.parse(data);
      this.isLoaded = true;
      
      logger.info('Operator data loaded', {
        operatorCount: this.operatorData.operators.length,
        lastModified: this.operatorData.lastModified
      });
    } catch (error) {
      if ((error as any)?.code === 'ENOENT') {
        // File doesn't exist, create it with empty data
        await this.saveOperators();
        logger.info('Created new operators file');
      } else {
        logger.error('Error loading operator data:', error);
        // Use empty operators as fallback
        this.operatorData = { operators: [], lastModified: null };
      }
      this.isLoaded = true;
    }
  }

  /**
   * Save current operator data to JSON file
   */
  private async saveOperators(): Promise<void> {
    try {
      this.operatorData.lastModified = new Date().toISOString();
      const data = JSON.stringify(this.operatorData, null, 2);
      await fs.writeFile(OperatorService.OPERATORS_FILE, data, 'utf-8');
      
      logger.debug('Operator data saved', {
        operatorCount: this.operatorData.operators.length
      });
    } catch (error) {
      logger.error('Error saving operator data:', error);
      throw error;
    }
  }

  /**
   * Ensure operator data is loaded
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.loadOperators();
    }
  }

  /**
   * Check if user is the primary operator
   */
  public isPrimaryOperator(userId: string): boolean {
    return userId === botConfig.operator.primaryOperatorId;
  }

  /**
   * Check if user is a sub-operator (in JSON file)
   */
  public async isSubOperator(userId: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.operatorData.operators.includes(userId);
  }

  /**
   * Check if user is an operator (primary OR sub-operator)
   */
  public async isOperator(userId: string): Promise<boolean> {
    if (this.isPrimaryOperator(userId)) {
      return true;
    }
    return await this.isSubOperator(userId);
  }

  /**
   * Check if user is authorized (alias for isOperator for clarity)
   */
  public async isAuthorized(userId: string): Promise<boolean> {
    return await this.isOperator(userId);
  }

  /**
   * Add a user as sub-operator (primary operator only)
   */
  public async addOperator(userId: string, addedBy: string): Promise<{ success: boolean; message: string }> {
    // Only primary operator can add operators
    if (!this.isPrimaryOperator(addedBy)) {
      return {
        success: false,
        message: 'Only the primary operator can add new operators.'
      };
    }

    // Cannot add primary operator as sub-operator
    if (this.isPrimaryOperator(userId)) {
      return {
        success: false,
        message: 'Primary operator cannot be added as sub-operator.'
      };
    }

    await this.ensureLoaded();
    
    if (this.operatorData.operators.includes(userId)) {
      return {
        success: false,
        message: 'User is already a sub-operator.'
      };
    }
    
    this.operatorData.operators.push(userId);
    await this.saveOperators();
    
    logger.info('Sub-operator added', { 
      userId,
      addedBy,
      totalOperators: this.operatorData.operators.length 
    });
    
    return {
      success: true,
      message: `User <@${userId}> has been added as a sub-operator.`
    };
  }

  /**
   * Remove a sub-operator (primary operator only)
   */
  public async removeOperator(userId: string, removedBy: string): Promise<{ success: boolean; message: string }> {
    // Only primary operator can remove operators
    if (!this.isPrimaryOperator(removedBy)) {
      return {
        success: false,
        message: 'Only the primary operator can remove operators.'
      };
    }

    // Cannot remove primary operator
    if (this.isPrimaryOperator(userId)) {
      return {
        success: false,
        message: 'Primary operator cannot be removed.'
      };
    }

    await this.ensureLoaded();
    
    const index = this.operatorData.operators.indexOf(userId);
    if (index === -1) {
      return {
        success: false,
        message: 'User is not a sub-operator.'
      };
    }
    
    this.operatorData.operators.splice(index, 1);
    await this.saveOperators();
    
    logger.info('Sub-operator removed', { 
      userId,
      removedBy,
      totalOperators: this.operatorData.operators.length 
    });
    
    return {
      success: true,
      message: `User <@${userId}> has been removed as a sub-operator.`
    };
  }

  /**
   * Get all operators (primary + sub-operators)
   */
  public async getAllOperators(): Promise<{
    primary: string;
    subOperators: string[];
  }> {
    await this.ensureLoaded();
    return {
      primary: botConfig.operator.primaryOperatorId,
      subOperators: [...this.operatorData.operators] // Return copy
    };
  }

  /**
   * Get operator statistics
   */
  public async getStats(): Promise<{
    primaryOperatorId: string;
    totalSubOperators: number;
    lastModified: string | null;
  }> {
    await this.ensureLoaded();
    return {
      primaryOperatorId: botConfig.operator.primaryOperatorId,
      totalSubOperators: this.operatorData.operators.length,
      lastModified: this.operatorData.lastModified,
    };
  }

  /**
   * Clear all sub-operators (primary operator only)
   */
  public async clearOperators(clearedBy: string): Promise<{ success: boolean; message: string }> {
    // Only primary operator can clear operators
    if (!this.isPrimaryOperator(clearedBy)) {
      return {
        success: false,
        message: 'Only the primary operator can clear all operators.'
      };
    }

    await this.ensureLoaded();
    const clearedCount = this.operatorData.operators.length;
    this.operatorData.operators = [];
    await this.saveOperators();
    
    logger.info('All sub-operators cleared', { clearedBy, clearedCount });
    
    return {
      success: true,
      message: `Cleared ${clearedCount} sub-operator${clearedCount === 1 ? '' : 's'}.`
    };
  }
}