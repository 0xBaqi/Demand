pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract DemandMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum Status { Open, Funded, Accepted, Fulfilled, Settled, Expired }
    struct Demand {
        address creator;
        uint256 target;
        uint256 totalCommitted;
        uint256 escrow;
        uint256 deadline;
        address supplier;
        Status status;
        string metadata;
    }
    IERC20 public immutable token;
    uint256 public demandCount;
    uint256 public totalEscrow;
    mapping(uint256 => Demand) public demands;
    mapping(uint256 => mapping(address => uint256)) public contributions;
    mapping(uint256 => mapping(address => string)) public offers;

    event Created(uint256 indexed demandId, address indexed creator, uint256 target, uint256 deadline, string metadata);
    event Backed(uint256 indexed demandId, address indexed backer, uint256 amount);
    event Funded(uint256 indexed demandId);
    event Offered(uint256 indexed demandId, address indexed supplier, string terms);
    event Accepted(uint256 indexed demandId, address indexed supplier);
    event Fulfilled(uint256 indexed demandId);
    event Settled(uint256 indexed demandId, address indexed supplier, uint256 amount);
    event Refunded(uint256 indexed demandId, address indexed backer, uint256 amount);

    constructor(address tokenAddress) {
        require(tokenAddress.code.length > 0, "Invalid token");
        token = IERC20(tokenAddress);
    }

    function createDemand(string calldata metadata, uint256 target, uint256 deadline) external returns (uint256 demandId) {
        require(target > 0 && deadline > block.timestamp, "Invalid target or deadline");
        require(bytes(metadata).length > 0 && bytes(metadata).length <= 512, "Invalid metadata");
        demandId = ++demandCount;
        demands[demandId] = Demand(msg.sender, target, 0, 0, deadline, address(0), Status.Open, metadata);
        emit Created(demandId, msg.sender, target, deadline, metadata);
    }

    function backDemand(uint256 demandId, uint256 amount) external nonReentrant {
        Demand storage demand = _demand(demandId);
        require(demand.status == Status.Open && block.timestamp < demand.deadline, "Funding closed");
        require(amount > 0 && amount <= demand.target - demand.totalCommitted, "Invalid contribution");
        uint256 balanceBefore = token.balanceOf(address(this));
        contributions[demandId][msg.sender] += amount;
        demand.totalCommitted += amount;
        demand.escrow += amount;
        totalEscrow += amount;
        if (demand.totalCommitted == demand.target) {
            demand.status = Status.Funded;
            emit Funded(demandId);
        }
        token.safeTransferFrom(msg.sender, address(this), amount);
        require(token.balanceOf(address(this)) == balanceBefore + amount, "Unsupported token transfer");
        emit Backed(demandId, msg.sender, amount);
    }

    function submitOffer(uint256 demandId, string calldata terms) external {
        Demand storage demand = _demand(demandId);
        require(demand.status == Status.Funded && block.timestamp < demand.deadline, "Offers closed");
        require(bytes(terms).length > 0 && bytes(terms).length <= 512, "Invalid terms");
        offers[demandId][msg.sender] = terms;
        emit Offered(demandId, msg.sender, terms);
    }

    function acceptSupplier(uint256 demandId, address supplier) external {
        Demand storage demand = _demand(demandId);
        require(msg.sender == demand.creator, "Creator only");
        require(demand.status == Status.Funded && block.timestamp < demand.deadline, "Acceptance closed");
        require(bytes(offers[demandId][supplier]).length > 0, "No offer");
        demand.supplier = supplier;
        demand.status = Status.Accepted;
        emit Accepted(demandId, supplier);
    }

    function markFulfilled(uint256 demandId) external {
        Demand storage demand = _demand(demandId);
        require(msg.sender == demand.supplier, "Supplier only");
        require(demand.status == Status.Accepted, "Not accepted");
        demand.status = Status.Fulfilled;
        emit Fulfilled(demandId);
    }

    function settle(uint256 demandId) external nonReentrant {
        Demand storage demand = _demand(demandId);
        require(msg.sender == demand.creator, "Creator only");
        require(demand.status == Status.Fulfilled, "Not fulfilled");
        uint256 amount = demand.escrow;
        demand.escrow = 0;
        totalEscrow -= amount;
        demand.status = Status.Settled;
        token.safeTransfer(demand.supplier, amount);
        emit Settled(demandId, demand.supplier, amount);
    }

    function refund(uint256 demandId) external nonReentrant {
        Demand storage demand = _demand(demandId);
        require(block.timestamp >= demand.deadline, "Too early");
        require(demand.status == Status.Open || demand.status == Status.Funded || demand.status == Status.Expired, "Supplier accepted");
        uint256 amount = contributions[demandId][msg.sender];
        require(amount > 0, "Nothing to refund");
        contributions[demandId][msg.sender] = 0;
        demand.escrow -= amount;
        totalEscrow -= amount;
        demand.status = Status.Expired;
        token.safeTransfer(msg.sender, amount);
        emit Refunded(demandId, msg.sender, amount);
    }

    function _demand(uint256 demandId) private view returns (Demand storage demand) {
        require(demandId > 0 && demandId <= demandCount, "Unknown demand");
        return demands[demandId];
    }
}
