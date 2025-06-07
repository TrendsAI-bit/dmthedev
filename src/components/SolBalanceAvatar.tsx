import React from 'react';

interface SolBalanceAvatarProps {
  solBalance: number;
  className?: string;
}

interface AvatarTier {
  name: string;
  minBalance: number;
  maxBalance: number;
  color: string;
  bgColor: string;
  borderColor: string;
  stickman: string;
  description: string;
  trait: string;
}

const avatarTiers: AvatarTier[] = [
  {
    name: "JEET",
    minBalance: 0,
    maxBalance: 0.5,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-500",
    stickman: "   😰\n  /|\\\n  / \\",
    description: "Frail, shaky, sad eyes",
    trait: "Paper hands, no conviction. Sells at first -5% dip then FOMOs back in at +50%."
  },
  {
    name: "NORMIE",
    minBalance: 0.5,
    maxBalance: 4.9,
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    borderColor: "border-teal-500",
    stickman: "   o\n  /|\\\n  / \\",
    description: "Plain stickman",
    trait: "Default citizen of Pumpville. DCA's safely, gets modest gains, sleeps well at night."
  },
  {
    name: "DEGEN",
    minBalance: 5,
    maxBalance: 19.9,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-500",
    stickman: "   🤪\n  /|\\\n  / \\",
    description: "Stickman with crazy hair",
    trait: "Makes gains, loses them all by Monday. Lives for the thrill, dies for the pump."
  },
  {
    name: "GIGACHAD",
    minBalance: 20,
    maxBalance: 49.9,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-500",
    stickman: "   😎\n  💪|💪\n  / \\",
    description: "Sunglasses, buff arms",
    trait: "Wise buyer, sells only at ATH. Diamond hands with steel nerves and 20/20 vision."
  },
  {
    name: "OVERLORD",
    minBalance: 50,
    maxBalance: 99.9,
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-500",
    stickman: "   🧐\n  /|\\\n  / \\",
    description: "Top hat, monocle, briefcase",
    trait: "Runs 10 wallets, 3 scripts, 1 burner. Probably your local whale's alt account."
  },
  {
    name: "WHALE",
    minBalance: 100,
    maxBalance: Infinity,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-500",
    stickman: "   🐋\n  /|\\\n  / \\",
    description: "Massive presence, controls markets",
    trait: "When whale moves, markets shake. Probably has a group chat with Vitalik."
  }
];

export default function SolBalanceAvatar({ solBalance, className = "" }: SolBalanceAvatarProps) {
  const getAvatarTier = (balance: number): AvatarTier => {
    for (const tier of avatarTiers) {
      if (balance >= tier.minBalance && balance < tier.maxBalance) {
        return tier;
      }
    }
    return avatarTiers[avatarTiers.length - 1]; // Default to WHALE if balance is very high
  };

  const tier = getAvatarTier(solBalance);
  const balanceRange = tier.maxBalance === Infinity ? 
    `>= ${tier.minBalance} SOL` : 
    `${tier.minBalance} - ${tier.maxBalance} SOL`;

  return (
    <div className={`${className}`}>
      <div className={`border-3 ${tier.borderColor} rounded-xl p-4 ${tier.bgColor} transform hover:scale-105 transition-all duration-300 hover:rotate-1 cursor-pointer max-w-xs`}>
        {/* Header Badge */}
        <div className={`${tier.color} ${tier.bgColor} border-2 ${tier.borderColor} rounded-full px-3 py-1 text-xs font-bold text-center mb-3 transform -rotate-1`}>
          {tier.name}
        </div>
        
        {/* Balance Range */}
        <div className="bg-white border-2 border-black rounded-lg p-2 mb-3 text-center">
          <div className="text-xs font-bold">{balanceRange}</div>
        </div>

        {/* Avatar Name */}
        <div className="text-center mb-4">
          <div className="text-lg font-bold">{tier.name === "DEGEN" ? "Mid Degen" : tier.name === "NORMIE" ? "Normie" : tier.name === "GIGACHAD" ? "GigaChad" : tier.name === "OVERLORD" ? "Overlord" : tier.name === "WHALE" ? "Whale" : "Jeetlet"}</div>
        </div>

        {/* Stickman Avatar */}
        <div className="text-center mb-4">
          <div className={`font-mono text-2xl whitespace-pre ${tier.color} hover:animate-bounce hover:scale-110 transition-all duration-300`}>
            {tier.stickman}
          </div>
          <div className="text-xs text-gray-600 italic mt-2">{tier.description}</div>
        </div>

        {/* Trait Description */}
        <div className="border-2 border-black border-dashed rounded p-2 text-xs text-gray-700">
          {tier.trait}
        </div>

        {/* Current Balance Display */}
        <div className="mt-3 text-center">
          <div className="text-xs font-bold text-gray-600">Current Balance:</div>
          <div className={`text-sm font-bold ${tier.color}`}>{solBalance.toFixed(2)} SOL</div>
        </div>
      </div>
    </div>
  );
} 