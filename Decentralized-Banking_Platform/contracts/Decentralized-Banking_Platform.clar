;; Decentralized Banking Platform Smart Contract
;; Written in Clarity for Stacks Blockchain

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant MIN_DEPOSIT u1000000) ;; 1 STX minimum deposit
(define-constant INTEREST_RATE u5) ;; 5% annual interest rate
(define-constant LOAN_COLLATERAL_RATIO u150) ;; 150% collateralization ratio
(define-constant SECONDS_PER_YEAR u31536000) ;; Seconds in a year

;; Error constants
(define-constant ERR_NOT_AUTHORIZED (err u401))
(define-constant ERR_INSUFFICIENT_BALANCE (err u402))
(define-constant ERR_INVALID_AMOUNT (err u403))
(define-constant ERR_ACCOUNT_NOT_FOUND (err u404))
(define-constant ERR_LOAN_NOT_FOUND (err u405))
(define-constant ERR_INSUFFICIENT_COLLATERAL (err u406))
(define-constant ERR_LOAN_ALREADY_EXISTS (err u407))

;; Data Variables
(define-data-var total-deposits uint u0)
(define-data-var total-loans uint u0)
(define-data-var loan-id-counter uint u0)

;; Data Maps
(define-map user-accounts 
  principal 
  {
    balance: uint,
    deposit-timestamp: uint,
    is-active: bool
  }
)

(define-map user-loans
  {user: principal, loan-id: uint}
  {
    amount: uint,
    collateral: uint,
    timestamp: uint,
    interest-rate: uint,
    is-active: bool
  }
)

(define-map user-loan-count principal uint)

;; Private Functions

;; Calculate compound interest
(define-private (calculate-interest (principal-amount uint) (rate uint) (time-elapsed uint))
  (let ((annual-rate (/ (* principal-amount rate) u100))
        (time-factor (/ time-elapsed SECONDS_PER_YEAR)))
    (/ (* annual-rate time-factor) u1)
  )
)

;; Get current block timestamp
(define-private (get-current-time)
  stacks-block-height ;; Using block height as proxy for time
)

;; Validate deposit amount
(define-private (is-valid-deposit (amount uint))
  (>= amount MIN_DEPOSIT)
)

;; Public Functions

;; Create account and make initial deposit
(define-public (create-account (initial-deposit uint))
  (let ((caller tx-sender)
        (current-time (get-current-time)))
    (asserts! (is-valid-deposit initial-deposit) ERR_INVALID_AMOUNT)
    (asserts! (is-none (map-get? user-accounts caller)) ERR_ACCOUNT_NOT_FOUND)
    
    ;; Transfer STX from user to contract
    (try! (stx-transfer? initial-deposit caller (as-contract tx-sender)))
    
    ;; Create account record
    (map-set user-accounts caller {
      balance: initial-deposit,
      deposit-timestamp: current-time,
      is-active: true
    })
    ;; Update total deposits
    (var-set total-deposits (+ (var-get total-deposits) initial-deposit))
    
    (ok true)
  )
)

;; Deposit funds to existing account
(define-public (deposit (amount uint))
  (let ((caller tx-sender)
        (current-time (get-current-time))
        (account (unwrap! (map-get? user-accounts caller) ERR_ACCOUNT_NOT_FOUND)))
    
    (asserts! (is-valid-deposit amount) ERR_INVALID_AMOUNT)
    (asserts! (get is-active account) ERR_NOT_AUTHORIZED)
    
    ;; Transfer STX from user to contract
    (try! (stx-transfer? amount caller (as-contract tx-sender)))
    
    ;; Update account balance
    (map-set user-accounts caller {
      balance: (+ (get balance account) amount),
      deposit-timestamp: current-time,
      is-active: true
    })
    
    ;; Update total deposits
    (var-set total-deposits (+ (var-get total-deposits) amount))
    
    (ok amount)
  )
)

;; Withdraw funds from account
(define-public (withdraw (amount uint))
  (let ((caller tx-sender)
        (account (unwrap! (map-get? user-accounts caller) ERR_ACCOUNT_NOT_FOUND))
        (current-time (get-current-time))
        (time-elapsed (- current-time (get deposit-timestamp account)))
        (interest (calculate-interest (get balance account) INTEREST_RATE time-elapsed))
        (total-balance (+ (get balance account) interest)))
    
    (asserts! (get is-active account) ERR_NOT_AUTHORIZED)
    (asserts! (<= amount total-balance) ERR_INSUFFICIENT_BALANCE)
    
    ;; Transfer STX from contract to user
    (try! (as-contract (stx-transfer? amount tx-sender caller)))
    
    ;; Update account balance
    (map-set user-accounts caller {
      balance: (- total-balance amount),
      deposit-timestamp: current-time,
      is-active: true
    })
    
    ;; Update total deposits
    (var-set total-deposits (- (var-get total-deposits) amount))
    
    (ok amount)
  )
)

;; Transfer funds between accounts
(define-public (transfer (recipient principal) (amount uint))
  (let ((sender tx-sender)
        (sender-account (unwrap! (map-get? user-accounts sender) ERR_ACCOUNT_NOT_FOUND))
        (recipient-account (unwrap! (map-get? user-accounts recipient) ERR_ACCOUNT_NOT_FOUND)))
    
    (asserts! (get is-active sender-account) ERR_NOT_AUTHORIZED)
    (asserts! (get is-active recipient-account) ERR_NOT_AUTHORIZED)
    (asserts! (<= amount (get balance sender-account)) ERR_INSUFFICIENT_BALANCE)
    
    ;; Update sender balance
    (map-set user-accounts sender {
      balance: (- (get balance sender-account) amount),
      deposit-timestamp: (get deposit-timestamp sender-account),
      is-active: true
    })
    
    ;; Update recipient balance
    (map-set user-accounts recipient {
      balance: (+ (get balance recipient-account) amount),
      deposit-timestamp: (get deposit-timestamp recipient-account),
      is-active: true
    })
    
    (ok amount)
  )
)

;; Request a loan with collateral
(define-public (request-loan (loan-amount uint) (collateral-amount uint))
  (let ((caller tx-sender)
        (current-time (get-current-time))
        (required-collateral (/ (* loan-amount LOAN_COLLATERAL_RATIO) u100))
        (new-loan-id (+ (var-get loan-id-counter) u1))
        (existing-loan-count (default-to u0 (map-get? user-loan-count caller))))
    
    (asserts! (>= collateral-amount required-collateral) ERR_INSUFFICIENT_COLLATERAL)
    (asserts! (> loan-amount u0) ERR_INVALID_AMOUNT)
    
    ;; Transfer collateral from user to contract
    (try! (stx-transfer? collateral-amount caller (as-contract tx-sender)))
    
    ;; Transfer loan amount from contract to user
    (try! (as-contract (stx-transfer? loan-amount tx-sender caller)))
    
    ;; Create loan record
    (map-set user-loans {user: caller, loan-id: new-loan-id} {
      amount: loan-amount,
      collateral: collateral-amount,
      timestamp: current-time,
      interest-rate: INTEREST_RATE,
      is-active: true
    })
    
    ;; Update counters
    (var-set loan-id-counter new-loan-id)
    (var-set total-loans (+ (var-get total-loans) loan-amount))
    (map-set user-loan-count caller (+ existing-loan-count u1))
    
    (ok new-loan-id)
  )
)

;; Repay a loan
(define-public (repay-loan (loan-id uint))
  (let ((caller tx-sender)
        (current-time (get-current-time))
        (loan (unwrap! (map-get? user-loans {user: caller, loan-id: loan-id}) ERR_LOAN_NOT_FOUND))
        (time-elapsed (- current-time (get timestamp loan)))
        (interest (calculate-interest (get amount loan) (get interest-rate loan) time-elapsed))
        (total-repayment (+ (get amount loan) interest)))
    
    (asserts! (get is-active loan) ERR_LOAN_NOT_FOUND)
    
    ;; Transfer repayment from user to contract
    (try! (stx-transfer? total-repayment caller (as-contract tx-sender)))
    
    ;; Return collateral to user
    (try! (as-contract (stx-transfer? (get collateral loan) tx-sender caller)))
    
    ;; Mark loan as inactive
    (map-set user-loans {user: caller, loan-id: loan-id} {
      amount: (get amount loan),
      collateral: (get collateral loan),
      timestamp: (get timestamp loan),
      interest-rate: (get interest-rate loan),
      is-active: false
    })
    
    ;; Update total loans
    (var-set total-loans (- (var-get total-loans) (get amount loan)))
    
    (ok total-repayment)
  )
)

;; Read-only Functions

;; Get account balance with interest
(define-read-only (get-account-balance (user principal))
  (match (map-get? user-accounts user)
    account 
    (let ((current-time (get-current-time))
          (time-elapsed (- current-time (get deposit-timestamp account)))
          (interest (calculate-interest (get balance account) INTEREST_RATE time-elapsed)))
      (ok (+ (get balance account) interest)))
    ERR_ACCOUNT_NOT_FOUND
  )
)

;; Get loan details
(define-read-only (get-loan-details (user principal) (loan-id uint))
  (match (map-get? user-loans {user: user, loan-id: loan-id})
    loan (ok loan)
    ERR_LOAN_NOT_FOUND
  )
)

;; Get platform statistics
(define-read-only (get-platform-stats)
  (ok {
    total-deposits: (var-get total-deposits),
    total-loans: (var-get total-loans),
    total-loan-count: (var-get loan-id-counter)
  })
)

;; Check if account exists
(define-read-only (account-exists (user principal))
  (is-some (map-get? user-accounts user))
)

;; Administrative Functions (Owner only)

;; Emergency pause (only contract owner)
(define-public (emergency-pause)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_NOT_AUTHORIZED)
    ;; Implementation would set a pause flag
    (ok true)
  )
)

;; Update interest rate (only contract owner)
(define-public (update-interest-rate (new-rate uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_NOT_AUTHORIZED)
    (asserts! (<= new-rate u20) ERR_INVALID_AMOUNT) ;; Max 20% interest rate
    ;; Implementation would update the rate
    (ok new-rate)
  )
)