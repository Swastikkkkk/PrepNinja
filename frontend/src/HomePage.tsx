import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BackgroundLines } from "./components/ui/background-lines";
import { Button } from "./components/ui/button";
import SectionWrapper from "./components/ui/section-wrapper";
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card";
import { FileText, Zap, Brain, CheckCircle2, Users } from "lucide-react";
import { useState, useEffect, useRef } from "react";



const scrollToSection = (id: string): void => {
  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: "smooth" });
  }
};



const HomePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"non-tech" | "tech" | "ats">("non-tech");
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const featuresRef = useRef<HTMLDivElement>(null);



  useEffect(() => {
    const anchors = document.querySelectorAll('a[href^="#"]');



    const handleClick = (e: Event) => {
      e.preventDefault();
      const target = e.currentTarget as HTMLAnchorElement;
      const id = target.getAttribute("href")?.substring(1);
      if (id) scrollToSection(id);
    };



    anchors.forEach((anchor) => anchor.addEventListener("click", handleClick));



    let observer: IntersectionObserver | null = null;



    if (featuresRef.current) {
      observer = new IntersectionObserver(
        ([entry]) => {
          setIsScrolled(entry.isIntersecting);
        },
        { threshold: 0.1 }
      );
      observer.observe(featuresRef.current);
    }



    return () => {
      anchors.forEach((anchor) =>
        anchor.removeEventListener("click", handleClick)
      );
      if (observer) observer.disconnect();
    };
  }, []);



  const tabs = [
    {
      id: "non-tech" as const,
      title: "Non Technical Interview Preparation",
      icon: Brain,
      description: "Master communication, behavioral questions, and soft skills for your next interview.",
      features: [
        "AI-powered mock interviews",
        "Real-time feedback on answers",
        "Personalized coaching",
        "Progress tracking",
      ],
      color: "from-primary to-primary/80",
      route: "/interview-flow",
      benefits: [
        "Improve confidence and communication",
        "Learn STAR method for behavioral questions",
        "Get instant feedback on your responses",
        "Track improvement over time",
      ],
    },
    {
      id: "tech" as const,
      title: "Technical Interview Preparation",
      icon: Zap,
      description: "Solve DSA problems, system design, and code your way to success.",
      features: [
        "Curated DSA problems",
        "System design courses",
        "Code execution environment",
        "Interview-level difficulty",
      ],
      color: "from-primary/80 to-primary/60",
      route: "/interview-set",
      benefits: [
        "Master data structures and algorithms",
        "Learn system design patterns",
        "Practice with real interview questions",
        "Get AI-driven optimization hints",
      ],
    },
    {
      id: "ats" as const,
      title: "ATS Resume Analyzer",
      icon: FileText,
      description: "Upload your resume and get an ATS score with actionable improvements.",
      features: [
        "Resume ATS analysis",
        "Gemini-powered feedback",
        "Improvement suggestions",
        "Score optimization tips",
      ],
      color: "from-primary/60 to-primary/40",
      route: "/ats-checker",
      benefits: [
        "Get accurate ATS score (0-100)",
        "Identify ATS-unfriendly formatting",
        "Optimize keywords for jobs",
        "Get recommendations to improve score",
      ],
    },
  ];



  const activeTabData = tabs.find((tab) => tab.id === activeTab)!;
  const IconComponent = activeTabData.icon;



  return (
    <div className="min-h-screen relative">
      {/* Hero Section with Main Title */}
      <div className="relative flex items-center justify-center w-full flex-col px-4 min-h-screen overflow-hidden">
        <BackgroundLines />



        <motion.div
          className="text-center z-20 mb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6">
            Your Complete Interview <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">Preparation Hub</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Master technical skills, ace behavioral interviews, and optimize your resume with AI-driven coaching and real-time feedback.
          </p>
        </motion.div>



        {/* Tab Navigation - Direct Links */}
        <div className="w-full max-w-6xl z-20 mb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <Link key={tab.id} to={tab.route} className="h-full">
                  <motion.div
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative p-8 rounded-2xl transition-all duration-300 cursor-pointer h-full ${
                      activeTab === tab.id
                        ? `bg-gradient-to-br ${tab.color} text-white shadow-2xl scale-105`
                        : "bg-card border-2 border-border hover:border-primary/50 text-foreground hover:shadow-xl hover:scale-102"
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`p-3 rounded-xl ${activeTab === tab.id ? 'bg-white/20' : 'bg-primary/10'}`}>
                        <TabIcon className={`w-7 h-7 ${activeTab === tab.id ? 'text-white' : 'text-primary'}`} />
                      </div>
                      <div className="text-left">
                        <p className={`font-bold text-base ${activeTab === tab.id ? 'text-white' : 'text-foreground'}`}>{tab.title}</p>
                      </div>
                    </div>
                  </motion.div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>



      {/* Scroll Indicator */}
      {!isScrolled && (
        <div className="w-full flex justify-center fixed bottom-8 left-0 z-50">
          <motion.div
            className="cursor-pointer flex flex-col items-center"
            animate={{ y: [0, 10, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            onClick={() => scrollToSection("tab-content")}
          >
            <span className="text-sm text-muted-foreground mb-2">
              Scroll to explore
            </span>
          </motion.div>
        </div>
      )}



      {/* Active Tab Content */}
      <div ref={featuresRef} id="tab-content">
        <SectionWrapper delay={0.2}>
          <section className="py-20 px-4 bg-gradient-to-b from-background via-card/50 to-background">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center"
            >
              {/* Left Content */}
              <div>
                <div className="flex items-center space-x-4 mb-6">
                  <div className={`p-3 rounded-lg bg-gradient-to-br ${activeTabData.color}`}>
                    <IconComponent className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold">{activeTabData.title}</h2>
                </div>



                <p className="text-lg text-muted-foreground mb-8">{activeTabData.description}</p>



                {/* Features List */}
                <div className="space-y-3 mb-8">
                  {activeTabData.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center space-x-3">
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                      <span className="text-foreground">{feature}</span>
                    </div>
                  ))}
                </div>



                {/* CTA Button - Direct Link */}
                <Link to={activeTabData.route}>
                  <Button
                    size="lg"
                    className={`bg-gradient-to-r ${activeTabData.color} text-white hover:shadow-lg`}
                  >
                    Start Preparing Now
                    <Zap className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              </div>



              {/* Right Content - 3D Card */}
              <div className="flex justify-center">
                <CardContainer className="inter-var">
                  <CardBody className={`bg-gradient-to-br ${activeTabData.color} relative group/card w-full rounded-2xl p-8 shadow-xl border border-white/20`}>
                    <CardItem translateZ="50" className="w-full mb-6">
                      <div className="flex justify-center">
                        <div className="p-8 bg-white/10 rounded-2xl backdrop-blur">
                          <IconComponent className="w-24 h-24 text-white" />
                        </div>
                      </div>
                    </CardItem>



                    <CardItem translateZ="40" className="w-full">
                      <h3 className="text-2xl font-bold text-white mb-4 text-center">Benefits</h3>
                    </CardItem>



                    <CardItem translateZ="30" className="w-full">
                      <ul className="space-y-2">
                        {activeTabData.benefits.map((benefit, idx) => (
                          <li key={idx} className="flex items-start space-x-2 text-white">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0" />
                            <span className="text-sm">{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </CardItem>
                  </CardBody>
                </CardContainer>
              </div>
            </motion.div>
          </section>
        </SectionWrapper>
      </div>



      {/* How It Works Section */}
      <SectionWrapper delay={0.2}>
        <section id="how-it-works" className="py-20 px-4 bg-background">
          <div className="container mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                How PrepNinjas Works
              </h2>
              <p className="text-xl text-muted-foreground">
                Your adaptive interview preparation journey in a few steps
              </p>
            </div>



            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {[
                {
                  number: 1,
                  title: "Choose Your Path",
                  description:
                    "Select between non-technical, technical, or ATS resume preparation based on your needs.",
                },
                {
                  number: 2,
                  title: "Start Preparing",
                  description:
                    "Access AI-powered coaching, practice problems, and real-time feedback tailored to your level.",
                },
                {
                  number: 3,
                  title: "Track & Improve",
                  description:
                    "Monitor your progress with detailed analytics and get personalized recommendations.",
                },
                {
                  number: 4,
                  title: "Get Feedback",
                  description:
                    "Receive instant AI-driven insights to identify weak areas and improvement opportunities.",
                },
                {
                  number: 5,
                  title: "Optimize Resume",
                  description:
                    "Use Gemini-powered ATS analysis to ensure your resume passes through applicant tracking systems.",
                },
                {
                  number: 6,
                  title: "Land Your Job",
                  description:
                    "Master all aspects of the interview process and confidently pursue your dream role.",
                },
              ].map((step) => (
                <div
                  key={step.number}
                  className="relative p-6 rounded-xl border border-border hover:border-primary/20 hover:shadow-lg transition-all duration-200 bg-card/50 hover:bg-card"
                >
                  <div className="w-12 h-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center text-xl font-bold mb-4">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </SectionWrapper>



      {/* Stats Section */}
      <SectionWrapper delay={0.1}>
        <section className="px-4 py-20 bg-gradient-to-r from-primary/5 to-primary/10">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">Why Choose PrepNinjas</h2>
            <div className="grid md:grid-cols-4 gap-8">
              {[
                { number: "500+", label: "Interview Problems" },
                { number: "AI-Powered", label: "Real-time Feedback" },
                { number: "100% Free", label: "Core Features" },
                { number: "24/7", label: "Available Anytime" },
              ].map((stat, idx) => (
                <motion.div
                  key={idx}
                  className="text-center p-6 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors"
                  whileHover={{ scale: 1.05 }}
                >
                  <p className="text-3xl md:text-4xl font-bold text-primary mb-2">{stat.number}</p>
                  <p className="text-muted-foreground">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </SectionWrapper>



      {/* CTA Section */}
      <SectionWrapper delay={0.3}>
        <section className="py-20 px-4 bg-gradient-to-br from-primary/90 to-primary/70">
          <div className="container mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
              Ready to Crack Your Dream Tech Interview?
            </h2>
            <p className="text-xl text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
              Choose your preparation path and start your journey to landing your dream job today.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/dashboard">
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-8 py-6 bg-transparent text-primary-foreground border-primary-foreground/40 hover:bg-primary-foreground/10"
              >
                Open Dashboard
              </Button>
            </Link>
            <Link to="/interview-flow">
              <Button
                size="lg"
                variant="secondary"
                className="text-lg px-8 py-6 bg-background hover:bg-background/90 text-foreground hover:shadow-lg transition-all duration-200"
              >
                Get Started <Zap className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            </div>
          </div>
        </section>
      </SectionWrapper>



      {/* Footer */}
      <SectionWrapper delay={0.1}>
        <footer className="bg-background border-t border-border py-12 px-4">
          <div className="container mx-auto">
            <div className="grid md:grid-cols-4 gap-8">
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-r from-primary to-primary/80 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <span className="text-xl font-bold text-foreground">
                    PrepNinjas
                  </span>
                </div>
                <p className="text-muted-foreground">
                  Empowering software engineers with personalized, adaptive, and
                  AI-driven interview preparation tools.
                </p>
              </div>



              <div>
                <h3 className="font-semibold mb-4 text-foreground">Platform</h3>
                <ul className="space-y-2">
                  {["Features", "Learning Paths", "AI Insights"].map((item) => (
                    <li key={item}>
                      <Link
                        to={`/${item.toLowerCase().replace(" ", "-")}`}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {item}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>



              <div>
                <h3 className="font-semibold mb-4 text-foreground">Support</h3>
                <ul className="space-y-2">
                  {["Help Center", "Contact Us", "Community"].map((item) => (
                    <li key={item}>
                      <Link
                        to={`/${item.toLowerCase().replace(" ", "-")}`}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {item}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>



              <div>
                <h3 className="font-semibold mb-4 text-foreground">Legal</h3>
                <ul className="space-y-2">
                  {["Privacy Policy", "Terms of Service", "Cookie Policy"].map(
                    (item) => (
                      <li key={item}>
                        <Link
                          to={`/${item.toLowerCase().replace(" ", "-")}`}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {item}
                        </Link>
                      </li>
                    )
                  )}
                </ul>
              </div>
            </div>



            <div className="border-t border-border mt-8 pt-8 text-center text-muted-foreground">
              <p>
                &copy; {new Date().getFullYear()} PrepNinjas. All rights
                reserved.
              </p>
            </div>
          </div>
        </footer>
      </SectionWrapper>
    </div>
  );
};



export default HomePage;
