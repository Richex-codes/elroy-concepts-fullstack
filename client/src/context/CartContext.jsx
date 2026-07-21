import { createContext, useState, useEffect } from "react";

export const CartContext = createContext();

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
  try {
    const data = localStorage.getItem("cart");
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
});


  // ✅ Save cart to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cart));
  }, [cart]);

  // ✅ Add to cart or increment quantity if product already exists
  const addToCart = (product) => {
  setCart((prevCart) => {
    const existingItem = prevCart.find(
      (item) => item.productId === product.productId
    );

    if (existingItem) {
      return prevCart.map((item) =>
        item.productId === product.productId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
    } else {
      return [
        ...prevCart,
        {
          ...product,
          quantity: 1,
          color: "", // ✅ IMPORTANT
        },
      ];
    }
  });
};

  // ✅ Update quantity of an item in the cart
  const updateQuantity = (productId, quantity) => {
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
  };

  // ✅ Remove product from cart
  const removeFromCart = (productId) => {
    setCart((prevCart) =>
      prevCart.filter((item) => item.productId !== productId)
    );
  };

  // ✅ Clear all items in cart
  const clearCart = () => {
    setCart([]);
  };

  const updateCartItem = (productId, updates) => {
  setCart((prev) =>
    prev.map((item) =>
      item.productId === productId
        ? {
            ...item,
            ...updates,
            color: updates.color ?? item.color,
          }
        : item
    )
  );
};

  return (
    <CartContext.Provider
      value={{ cart, addToCart, updateQuantity, removeFromCart, clearCart, updateCartItem }}
    >
      {children}
    </CartContext.Provider>
  );
}
