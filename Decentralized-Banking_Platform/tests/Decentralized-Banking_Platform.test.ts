// banking-platform.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Clarity contract simulation
class MockClarityContract {
  constructor() {
    this.reset()
  }

  reset() {
    this.userAccounts = new Map()
    this.userLoans = new Map()
    this.userLoanCount = new Map()
    this.totalDeposits = 0
    this.totalLoans = 0
    this.loanIdCounter = 0
    this.currentBlockHeight = 1000
    this.contractOwner = 'SP1234567890ABCDEF'
    
    // Constants
    this.MIN_DEPOSIT = 1000000
    this.INTEREST_RATE = 5
    this.LOAN_COLLATERAL_RATIO = 150
    this.SECONDS_PER_YEAR = 31536000
    
    // Error constants
    this.ERR_NOT_AUTHORIZED = { type: 'error', value: 401 }
    this.ERR_INSUFFICIENT_BALANCE = { type: 'error', value: 402 }
    this.ERR_INVALID_AMOUNT = { type: 'error', value: 403 }
    this.ERR_ACCOUNT_NOT_FOUND = { type: 'error', value: 404 }
    this.ERR_LOAN_NOT_FOUND = { type: 'error', value: 405 }
    this.ERR_INSUFFICIENT_COLLATERAL = { type: 'error', value: 406 }
  }

  // Helper functions
  calculateInterest(principalAmount, rate, timeElapsed) {
    const annualRate = Math.floor((principalAmount * rate) / 100)
    const timeFactor = Math.floor(timeElapsed / this.SECONDS_PER_YEAR)
    return Math.floor((annualRate * timeFactor) / 1)
  }

  getCurrentTime() {
    return this.currentBlockHeight
  }

  isValidDeposit(amount) {
    return amount >= this.MIN_DEPOSIT
  }

  // Public functions
  createAccount(sender, initialDeposit) {
    if (!this.isValidDeposit(initialDeposit)) {
      return this.ERR_INVALID_AMOUNT
    }
    
    if (this.userAccounts.has(sender)) {
      return this.ERR_ACCOUNT_NOT_FOUND
    }

    const currentTime = this.getCurrentTime()
    
    this.userAccounts.set(sender, {
      balance: initialDeposit,
      depositTimestamp: currentTime,
      isActive: true
    })
    
    this.totalDeposits += initialDeposit
    
    return { type: 'ok', value: true }
  }

  deposit(sender, amount) {
    if (!this.userAccounts.has(sender)) {
      return this.ERR_ACCOUNT_NOT_FOUND
    }

    const account = this.userAccounts.get(sender)
    
    if (!this.isValidDeposit(amount)) {
      return this.ERR_INVALID_AMOUNT
    }
    
    if (!account.isActive) {
      return this.ERR_NOT_AUTHORIZED
    }

    const currentTime = this.getCurrentTime()
    
    this.userAccounts.set(sender, {
      balance: account.balance + amount,
      depositTimestamp: currentTime,
      isActive: true
    })
    
    this.totalDeposits += amount
    
    return { type: 'ok', value: amount }
  }

  withdraw(sender, amount) {
    if (!this.userAccounts.has(sender)) {
      return this.ERR_ACCOUNT_NOT_FOUND
    }

    const account = this.userAccounts.get(sender)
    
    if (!account.isActive) {
      return this.ERR_NOT_AUTHORIZED
    }

    const currentTime = this.getCurrentTime()
    const timeElapsed = currentTime - account.depositTimestamp
    const interest = this.calculateInterest(account.balance, this.INTEREST_RATE, timeElapsed)
    const totalBalance = account.balance + interest

    if (amount > totalBalance) {
      return this.ERR_INSUFFICIENT_BALANCE
    }

    this.userAccounts.set(sender, {
      balance: totalBalance - amount,
      depositTimestamp: currentTime,
      isActive: true
    })
    
    this.totalDeposits -= amount
    
    return { type: 'ok', value: amount }
  }

  transfer(sender, recipient, amount) {
    if (!this.userAccounts.has(sender) || !this.userAccounts.has(recipient)) {
      return this.ERR_ACCOUNT_NOT_FOUND
    }

    const senderAccount = this.userAccounts.get(sender)
    const recipientAccount = this.userAccounts.get(recipient)

    if (!senderAccount.isActive || !recipientAccount.isActive) {
      return this.ERR_NOT_AUTHORIZED
    }

    if (amount > senderAccount.balance) {
      return this.ERR_INSUFFICIENT_BALANCE
    }

    this.userAccounts.set(sender, {
      ...senderAccount,
      balance: senderAccount.balance - amount
    })

    this.userAccounts.set(recipient, {
      ...recipientAccount,
      balance: recipientAccount.balance + amount
    })

    return { type: 'ok', value: amount }
  }

  requestLoan(sender, loanAmount, collateralAmount) {
    const requiredCollateral = Math.floor((loanAmount * this.LOAN_COLLATERAL_RATIO) / 100)
    
    if (collateralAmount < requiredCollateral) {
      return this.ERR_INSUFFICIENT_COLLATERAL
    }
    
    if (loanAmount <= 0) {
      return this.ERR_INVALID_AMOUNT
    }

    const currentTime = this.getCurrentTime()
    const newLoanId = this.loanIdCounter + 1
    const existingLoanCount = this.userLoanCount.get(sender) || 0

    const loanKey = `${sender}-${newLoanId}`
    this.userLoans.set(loanKey, {
      amount: loanAmount,
      collateral: collateralAmount,
      timestamp: currentTime,
      interestRate: this.INTEREST_RATE,
      isActive: true
    })

    this.loanIdCounter = newLoanId
    this.totalLoans += loanAmount
    this.userLoanCount.set(sender, existingLoanCount + 1)

    return { type: 'ok', value: newLoanId }
  }

  repayLoan(sender, loanId) {
    const loanKey = `${sender}-${loanId}`
    
    if (!this.userLoans.has(loanKey)) {
      return this.ERR_LOAN_NOT_FOUND
    }

    const loan = this.userLoans.get(loanKey)
    
    if (!loan.isActive) {
      return this.ERR_LOAN_NOT_FOUND
    }

    const currentTime = this.getCurrentTime()
    const timeElapsed = currentTime - loan.timestamp
    const interest = this.calculateInterest(loan.amount, loan.interestRate, timeElapsed)
    const totalRepayment = loan.amount + interest

    this.userLoans.set(loanKey, {
      ...loan,
      isActive: false
    })

    this.totalLoans -= loan.amount

    return { type: 'ok', value: totalRepayment }
  }

  // Read-only functions
  getAccountBalance(user) {
    if (!this.userAccounts.has(user)) {
      return this.ERR_ACCOUNT_NOT_FOUND
    }

    const account = this.userAccounts.get(user)
    const currentTime = this.getCurrentTime()
    const timeElapsed = currentTime - account.depositTimestamp
    const interest = this.calculateInterest(account.balance, this.INTEREST_RATE, timeElapsed)

    return { type: 'ok', value: account.balance + interest }
  }

  getLoanDetails(user, loanId) {
    const loanKey = `${user}-${loanId}`
    
    if (!this.userLoans.has(loanKey)) {
      return this.ERR_LOAN_NOT_FOUND
    }

    return { type: 'ok', value: this.userLoans.get(loanKey) }
  }

  getPlatformStats() {
    return {
      type: 'ok',
      value: {
        totalDeposits: this.totalDeposits,
        totalLoans: this.totalLoans,
        totalLoanCount: this.loanIdCounter
      }
    }
  }

  accountExists(user) {
    return this.userAccounts.has(user)
  }

  // Admin functions
  emergencyPause(sender) {
    if (sender !== this.contractOwner) {
      return this.ERR_NOT_AUTHORIZED
    }
    return { type: 'ok', value: true }
  }

  updateInterestRate(sender, newRate) {
    if (sender !== this.contractOwner) {
      return this.ERR_NOT_AUTHORIZED
    }
    if (newRate > 20) {
      return this.ERR_INVALID_AMOUNT
    }
    return { type: 'ok', value: newRate }
  }
}

describe('Decentralized Banking Platform', () => {
  let contract
  const user1 = 'SP1ABCDEFGH123456789'
  const user2 = 'SP2IJKLMNOP987654321'
  const contractOwner = 'SP1234567890ABCDEF'

  beforeEach(() => {
    contract = new MockClarityContract()
  })

  describe('Account Management', () => {
    it('should create account with valid initial deposit', () => {
      const result = contract.createAccount(user1, 2000000)
      
      expect(result.type).toBe('ok')
      expect(result.value).toBe(true)
      expect(contract.accountExists(user1)).toBe(true)
      expect(contract.totalDeposits).toBe(2000000)
    })

    it('should reject account creation with insufficient deposit', () => {
      const result = contract.createAccount(user1, 500000)
      
      expect(result.type).toBe('error')
      expect(result.value).toBe(403)
      expect(contract.accountExists(user1)).toBe(false)
    })

    it('should prevent duplicate account creation', () => {
      contract.createAccount(user1, 2000000)
      const result = contract.createAccount(user1, 3000000)
      
      expect(result.type).toBe('error')
      expect(result.value).toBe(404)
    })

    it('should get account balance with interest', () => {
      contract.createAccount(user1, 2000000)
      
      // Simulate time passage
      contract.currentBlockHeight += 100
      
      const result = contract.getAccountBalance(user1)
      
      expect(result.type).toBe('ok')
      expect(result.value).toBeGreaterThanOrEqual(2000000)
    })
  })

  describe('Deposit Operations', () => {
    beforeEach(() => {
      contract.createAccount(user1, 2000000)
    })

    it('should deposit funds to existing account', () => {
      const result = contract.deposit(user1, 1500000)
      
      expect(result.type).toBe('ok')
      expect(result.value).toBe(1500000)
      
      const balance = contract.getAccountBalance(user1)
      expect(balance.value).toBeGreaterThanOrEqual(3500000)
    })

    it('should reject deposit with invalid amount', () => {
      const result = contract.deposit(user1, 500000)
      
      expect(result.type).toBe('error')
      expect(result.value).toBe(403)
    })

    it('should reject deposit to non-existent account', () => {
      const result = contract.deposit(user2, 2000000)
      
      expect(result.type).toBe('error')
      expect(result.value).toBe(404)
    })
  })

  describe('Withdrawal Operations', () => {
    beforeEach(() => {
      contract.createAccount(user1, 2000000)
    })

    it('should withdraw funds from account', () => {
      const result = contract.withdraw(user1, 1000000)
      
      expect(result.type).toBe('ok')
      expect(result.value).toBe(1000000)
      
      const balance = contract.getAccountBalance(user1)
      expect(balance.value).toBeLessThan(2000000)
    })

    it('should reject withdrawal exceeding balance', () => {
      const result = contract.withdraw(user1, 5000000)
      
      expect(result.type).toBe('error')
      expect(result.value).toBe(402)
    })

    it('should reject withdrawal from non-existent account', () => {
      const result = contract.withdraw(user2, 1000000)
      
      expect(result.type).toBe('error')
      expect(result.value).toBe(404)
    })
  })

  describe('Transfer Operations', () => {
    beforeEach(() => {
      contract.createAccount(user1, 3000000)
      contract.createAccount(user2, 2000000)
    })

    it('should transfer funds between accounts', () => {
      const result = contract.transfer(user1, user2, 1000000)
      
      expect(result.type).toBe('ok')
      expect(result.value).toBe(1000000)
      
      const sender = contract.userAccounts.get(user1)
      const recipient = contract.userAccounts.get(user2)
      
      expect(sender.balance).toBe(2000000)
      expect(recipient.balance).toBe(3000000)
    })

    it('should reject transfer with insufficient balance', () => {
      const result = contract.transfer(user1, user2, 5000000)
      
      expect(result.type).toBe('error')
      expect(result.value).toBe(402)
    })

    it('should reject transfer to non-existent account', () => {
      const result = contract.transfer(user1, 'SPNONEXISTENT', 1000000)
      
      expect(result.type).toBe('error')
      expect(result.value).toBe(404)
    })
  })

  describe('Loan Operations', () => {
    beforeEach(() => {
      contract.createAccount(user1, 5000000)
    })

    it('should request loan with sufficient collateral', () => {
      const loanAmount = 1000000
      const collateralAmount = 2000000 // 200% collateral
      
      const result = contract.requestLoan(user1, loanAmount, collateralAmount)
      
      expect(result.type).toBe('ok')
      expect(result.value).toBe(1) // First loan ID
      expect(contract.totalLoans).toBe(loanAmount)
    })

    it('should reject loan with insufficient collateral', () => {
      const loanAmount = 1000000
      const collateralAmount = 1000000 // Only 100% collateral (need 150%)
      
      const result = contract.requestLoan(user1, loanAmount, collateralAmount)
      
      expect(result.type).toBe('error')
      expect(result.value).toBe(406)
    })

    it('should reject loan with zero amount', () => {
      const result = contract.requestLoan(user1, 0, 2000000)
      
      expect(result.type).toBe('error')
      expect(result.value).toBe(403)
    })

    it('should repay loan successfully', () => {
      // First request a loan
      const loanAmount = 1000000
      const collateralAmount = 2000000
      
      const loanResult = contract.requestLoan(user1, loanAmount, collateralAmount)
      expect(loanResult.type).toBe('ok')
      
      const loanId = loanResult.value
      
      // Simulate time passage for interest
      contract.currentBlockHeight += 50
      
      // Repay the loan
      const repayResult = contract.repayLoan(user1, loanId)
      
      expect(repayResult.type).toBe('ok')
      expect(repayResult.value).toBeGreaterThanOrEqual(loanAmount)
      
      // Check loan is marked inactive
      const loanDetails = contract.getLoanDetails(user1, loanId)
      expect(loanDetails.value.isActive).toBe(false)
    })

    it('should reject repayment of non-existent loan', () => {
      const result = contract.repayLoan(user1, 999)
      
      expect(result.type).toBe('error')
      expect(result.value).toBe(405)
    })

    it('should get loan details', () => {
      const loanAmount = 1000000
      const collateralAmount = 2000000
      
      const loanResult = contract.requestLoan(user1, loanAmount, collateralAmount)
      const loanId = loanResult.value
      
      const details = contract.getLoanDetails(user1, loanId)
      
      expect(details.type).toBe('ok')
      expect(details.value.amount).toBe(loanAmount)
      expect(details.value.collateral).toBe(collateralAmount)
      expect(details.value.isActive).toBe(true)
    })
  })

  describe('Platform Statistics', () => {
    it('should track platform statistics', () => {
      // Create accounts and make deposits
      contract.createAccount(user1, 2000000)
      contract.createAccount(user2, 3000000)
      
      // Request loans
      contract.requestLoan(user1, 500000, 1000000)
      contract.requestLoan(user2, 800000, 1500000)
      
      const stats = contract.getPlatformStats()
      
      expect(stats.type).toBe('ok')
      expect(stats.value.totalDeposits).toBe(5000000)
      expect(stats.value.totalLoans).toBe(1300000)
      expect(stats.value.totalLoanCount).toBe(2)
    })
  })

  describe('Administrative Functions', () => {
    it('should allow owner to emergency pause', () => {
      const result = contract.emergencyPause(contractOwner)
      
      expect(result.type).toBe('ok')
      expect(result.value).toBe(true)
    })

    it('should reject emergency pause from non-owner', () => {
      const result = contract.emergencyPause(user1)
      
      expect(result.type).toBe('error')
      expect(result.value).toBe(401)
    })

    it('should allow owner to update interest rate', () => {
      const result = contract.updateInterestRate(contractOwner, 10)
      
      expect(result.type).toBe('ok')
      expect(result.value).toBe(10)
    })

    it('should reject interest rate update from non-owner', () => {
      const result = contract.updateInterestRate(user1, 10)
      
      expect(result.type).toBe('error')
      expect(result.value).toBe(401)
    })

    it('should reject excessive interest rate', () => {
      const result = contract.updateInterestRate(contractOwner, 25)
      
      expect(result.type).toBe('error')
      expect(result.value).toBe(403)
    })
  })

  describe('Interest Calculations', () => {
    it('should calculate interest correctly', () => {
      const principal = 1000000
      const rate = 5
      const timeElapsed = 31536000 // 1 year
      
      const interest = contract.calculateInterest(principal, rate, timeElapsed)
      
      expect(interest).toBe(50000) // 5% of 1,000,000
    })

    it('should handle zero time elapsed', () => {
      const principal = 1000000
      const rate = 5
      const timeElapsed = 0
      
      const interest = contract.calculateInterest(principal, rate, timeElapsed)
      
      expect(interest).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle multiple loans per user', () => {
      contract.createAccount(user1, 10000000)
      
      const loan1 = contract.requestLoan(user1, 1000000, 2000000)
      const loan2 = contract.requestLoan(user1, 1500000, 3000000)
      
      expect(loan1.type).toBe('ok')
      expect(loan2.type).toBe('ok')
      expect(loan1.value).toBe(1)
      expect(loan2.value).toBe(2)
      
      const userLoanCount = contract.userLoanCount.get(user1)
      expect(userLoanCount).toBe(2)
    })

    it('should maintain data integrity after multiple operations', () => {
      // Complex scenario with multiple users and operations
      contract.createAccount(user1, 5000000)
      contract.createAccount(user2, 3000000)
      
      contract.deposit(user1, 2000000)
      contract.transfer(user1, user2, 1000000)
      contract.requestLoan(user2, 800000, 1500000)
      contract.withdraw(user1, 500000)
      
      const stats = contract.getPlatformStats()
      const user1Balance = contract.getAccountBalance(user1)
      const user2Balance = contract.getAccountBalance(user2)
      
      expect(stats.type).toBe('ok')
      expect(user1Balance.type).toBe('ok')
      expect(user2Balance.type).toBe('ok')
      
      // Verify data consistency
      expect(stats.value.totalLoans).toBe(800000)
      expect(contract.userLoans.size).toBe(1)
    })
  })
})