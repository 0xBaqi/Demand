pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract MockUSDG is ERC20 {
    constructor() ERC20("Demo USDG", "USDG") { _mint(msg.sender, 1000000 * 10 ** 6); }
    function decimals() public pure override returns (uint8) { return 6; }
}
